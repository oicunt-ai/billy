/**
 * Development-only browser session helpers (server-only).
 *
 * In-memory opaque sessions for local development. Sessions die with the
 * server process; nothing is persisted and no production identity provider
 * is involved. Never import this from client components.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";

if (typeof window !== "undefined") {
  throw new Error("src/lib/dev-auth.ts is server-only");
}

export const SESSION_COOKIE_NAME = "billy_dev_session";
export const SESSION_TTL_MS = 30 * 60 * 1000;
export const SESSION_TTL_SECONDS = 30 * 60;

const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_INPUT_LENGTH = 512;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000;

interface SessionRecord {
  readonly expiresAt: number;
}

interface RateRecord {
  count: number;
  windowStart: number;
}

const sessions = new Map<string, SessionRecord>();
const loginAttempts = new Map<string, RateRecord>();

/** Explicit opt-in plus a hard production kill-switch. */
export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env["BILLY_DEV_AUTH_ENABLED"] === "true" && env["NODE_ENV"] !== "production"
  );
}

/** Null when missing or too short — there is no default secret. */
export function getAccessSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env["BILLY_DEV_ACCESS_SECRET"];
  if (typeof raw !== "string" || raw.length < MIN_SECRET_LENGTH) {
    return null;
  }
  return raw;
}

export function verifyAccessSecret(
  candidate: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = getAccessSecret(env);
  if (expected === null) {
    return false;
  }
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > MAX_SECRET_INPUT_LENGTH
  ) {
    return false;
  }
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function sweepExpiredSessions(now: number): void {
  for (const [id, record] of sessions) {
    if (record.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}

export function createSession(now: number = Date.now()): {
  readonly id: string;
  readonly expiresAt: number;
} {
  sweepExpiredSessions(now);
  const id = randomBytes(32).toString("hex");
  const expiresAt = now + SESSION_TTL_MS;
  sessions.set(id, { expiresAt });
  return { id, expiresAt };
}

export function isSessionValid(id: string | null, now: number = Date.now()): boolean {
  if (id === null || id === "") {
    return false;
  }
  const record = sessions.get(id);
  if (!record) {
    return false;
  }
  if (record.expiresAt <= now) {
    sessions.delete(id);
    return false;
  }
  return true;
}

export function revokeSession(id: string | null): void {
  if (id !== null && id !== "") {
    sessions.delete(id);
  }
}

/** Test helper and restart-semantics equivalent (restart clears the Maps). */
export function clearAllSessions(): void {
  sessions.clear();
  loginAttempts.clear();
}

/** Sliding-window login throttle, keyed by caller label (e.g. client IP). */
export function checkLoginRateLimit(key: string, now: number = Date.now()): boolean {
  const record = loginAttempts.get(key);
  if (!record || now - record.windowStart >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (record.count >= LOGIN_MAX_ATTEMPTS) {
    return false;
  }
  record.count += 1;
  return true;
}

export function parseSessionId(cookieHeader: string | null): string | null {
  if (cookieHeader === null || cookieHeader === "") {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    if (part.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

export function buildSessionCookie(sessionId: string): string {
  // Secure is intentionally absent: loopback local development is plain
  // HTTP, and this mechanism is disabled outside explicit local dev.
  return (
    `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; ` +
    `SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

export function buildClearedCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

function normalizeHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  return LOOPBACK_HOSTS.includes(lower) ? "loopback" : lower;
}

/**
 * State-changing browser calls must carry an explicit Origin matching the
 * request origin. Same-origin fetch always sends one; its absence means a
 * non-browser caller, which local login does not serve.
 *
 * Loopback aliases (localhost, 127.0.0.1, ::1) are treated as identical.
 * The request host itself must additionally be loopback, which defeats DNS
 * rebinding (a rebound host would fail this check even if Origin matched).
 */
export function isSameOriginRequest(headers: Headers, requestUrl: string): boolean {
  const origin = headers.get("origin");
  if (origin === null || origin === "") {
    return false;
  }
  try {
    const expected = new URL(requestUrl);
    const actual = new URL(origin);
    if (actual.protocol !== expected.protocol) {
      return false;
    }
    if (actual.port !== expected.port) {
      return false;
    }
    if (normalizeHost(actual.hostname) !== normalizeHost(expected.hostname)) {
      return false;
    }
    return LOOPBACK_HOSTS.includes(expected.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface MutationAuthSuccess {
  readonly ok: true;
}

export interface MutationAuthFailure {
  readonly ok: false;
  readonly status: 404 | 403 | 401;
  readonly code: string;
  readonly message: string;
}

export type MutationAuth = MutationAuthSuccess | MutationAuthFailure;

/**
 * Single enforcement point for cookie-authenticated mutations
 * (DELETE /api/dev-session, POST /api/conversations, POST /api/completions).
 * Order is deliberate: undiscoverable when disabled (404), CSRF-rejecting
 * before any session or upstream work (403), then session validation (401).
 * Pure and framework-agnostic: failure means the caller must not proceed,
 * so invalid-origin requests can never reach upstream services.
 */
export function authorizeMutation(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly headers: Headers;
  readonly url: string;
  readonly cookieHeader: string | null;
}): MutationAuth {
  if (!isDevAuthEnabled(input.env ?? process.env)) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Not found" };
  }
  if (!isSameOriginRequest(input.headers, input.url)) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "Same-origin requests only" };
  }
  if (!isSessionValid(parseSessionId(input.cookieHeader))) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Developer sign-in required",
    };
  }
  return { ok: true };
}
