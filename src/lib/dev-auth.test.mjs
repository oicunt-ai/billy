/**
 * Focused tests for the development-only session mechanism.
 *
 * Run with: npm run test
 *
 * Pure-function tests over src/lib/dev-auth.ts. No network, no secrets:
 * the access secret under test is a throwaway fixture value.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  authorizeMutation,
  buildClearedCookie,
  buildSessionCookie,
  checkLoginRateLimit,
  clearAllSessions,
  createSession,
  getAccessSecret,
  isDevAuthEnabled,
  isSameOriginRequest,
  isSessionValid,
  parseSessionId,
  revokeSession,
  verifyAccessSecret,
} from "./dev-auth.ts";

const FIXTURE_SECRET = "test-fixture-access-secret-32-chars!!";
const baseEnv = {
  BILLY_DEV_AUTH_ENABLED: "true",
  NODE_ENV: "development",
  BILLY_DEV_ACCESS_SECRET: FIXTURE_SECRET,
};

function envWith(overrides) {
  return { ...baseEnv, ...overrides };
}

beforeEach(() => {
  clearAllSessions();
});

describe("dev-auth enablement", () => {
  it("requires the explicit flag and refuses production", () => {
    assert.equal(isDevAuthEnabled(envWith({})), true);
    assert.equal(isDevAuthEnabled(envWith({ BILLY_DEV_AUTH_ENABLED: "false" })), false);
    assert.equal(isDevAuthEnabled(envWith({ BILLY_DEV_AUTH_ENABLED: undefined })), false);
    assert.equal(isDevAuthEnabled(envWith({ NODE_ENV: "production" })), false);
  });

  it("rejects missing or short access secrets (no defaults)", () => {
    assert.equal(getAccessSecret(envWith({})), FIXTURE_SECRET);
    assert.equal(getAccessSecret(envWith({ BILLY_DEV_ACCESS_SECRET: undefined })), null);
    assert.equal(getAccessSecret(envWith({ BILLY_DEV_ACCESS_SECRET: "short" })), null);
  });
});

describe("access secret verification", () => {
  it("accepts the configured secret and rejects anything else", () => {
    assert.equal(verifyAccessSecret(FIXTURE_SECRET, envWith({})), true);
    assert.equal(verifyAccessSecret("wrong-secret-value-that-is-long-enough!!", envWith({})), false);
    assert.equal(verifyAccessSecret("", envWith({})), false);
    assert.equal(verifyAccessSecret(null, envWith({})), false);
    assert.equal(verifyAccessSecret(42, envWith({})), false);
    assert.equal(
      verifyAccessSecret(FIXTURE_SECRET, envWith({ BILLY_DEV_ACCESS_SECRET: undefined })),
      false,
    );
  });
});

describe("sessions", () => {
  it("creates opaque ids, validates, expires, and revokes", () => {
    const now = 1_700_000_000_000;
    const first = createSession(now);
    const second = createSession(now);
    assert.ok(first.id.length >= 32 && !first.id.includes("."));
    assert.notEqual(first.id, second.id);
    assert.equal(isSessionValid(first.id, now), true);
    assert.equal(isSessionValid("nope", now), false);
    assert.equal(isSessionValid(null, now), false);
    assert.equal(isSessionValid("", now), false);
    assert.equal(isSessionValid(first.id, now + SESSION_TTL_MS), false);
    assert.equal(isSessionValid(first.id, now), false);
    revokeSession(second.id);
    assert.equal(isSessionValid(second.id, now), false);
  });
});

describe("login rate limiting", () => {
  it("allows a burst then blocks until the window passes", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      assert.equal(checkLoginRateLimit("loopback", now), true);
    }
    assert.equal(checkLoginRateLimit("loopback", now), false);
    assert.equal(checkLoginRateLimit("other", now), true);
    assert.equal(checkLoginRateLimit("loopback", now + 61_000), true);
  });
});

describe("session cookie", () => {
  it("round-trips the cookie with HttpOnly + SameSite protections", () => {
    const header = buildSessionCookie("abc123");
    assert.ok(header.startsWith(`${SESSION_COOKIE_NAME}=abc123`));
    assert.ok(header.includes("HttpOnly"));
    assert.ok(header.includes("SameSite=Lax"));
    assert.ok(header.includes("Path=/"));
    assert.ok(!header.includes("abc123; abc123"));
    assert.equal(parseSessionId(header), "abc123");
    assert.equal(parseSessionId(`other=1; ${header}`), "abc123");
    assert.equal(parseSessionId(null), null);
    assert.equal(parseSessionId("other=1"), null);
    const cleared = buildClearedCookie();
    assert.ok(cleared.includes("Max-Age=0"));
    assert.equal(parseSessionId(cleared), null);
  });
});

describe("same-origin check", () => {
  it("requires an explicit matching Origin on a loopback host", () => {
    const url = "http://127.0.0.1:3100/api/dev-session";
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "http://127.0.0.1:3100" }), url),
      true,
    );
    // Loopback aliases are equivalent.
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "http://localhost:3100" }), url),
      true,
    );
    assert.equal(
      isSameOriginRequest(
        new Headers({ origin: "http://127.0.0.1:3100" }),
        "http://localhost:3100/api/dev-session",
      ),
      true,
    );
    // Attacker origin, missing origin, port/protocol mismatch.
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "http://evil.test" }), url),
      false,
    );
    assert.equal(isSameOriginRequest(new Headers({}), url), false);
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "http://127.0.0.1:9999" }), url),
      false,
    );
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "https://127.0.0.1:3100" }), url),
      false,
    );
    // Non-loopback request hosts are rejected even with matching Origin
    // (DNS-rebinding defense).
    assert.equal(
      isSameOriginRequest(
        new Headers({ origin: "http://evil.test:3100" }),
        "http://evil.test:3100/api/dev-session",
      ),
      false,
    );
    assert.equal(
      isSameOriginRequest(new Headers({ origin: "http://127.0.0.1:3100" }), "not-a-url"),
      false,
    );
  });
});

describe("authorizeMutation", () => {
  const REQUEST_URL = "http://127.0.0.1:3100/api/completions";

  function authedInput(overrides = {}) {
    const { id } = createSession();
    return {
      env: { ...baseEnv },
      headers: new Headers({ origin: "http://127.0.0.1:3100" }),
      url: REQUEST_URL,
      cookieHeader: `${SESSION_COOKIE_NAME}=${id}; other=1`,
      ...overrides,
    };
  }

  it("accepts valid same-origin requests with a live session", () => {
    assert.deepEqual(authorizeMutation(authedInput()), { ok: true });
    assert.deepEqual(
      authorizeMutation(
        authedInput({
          headers: new Headers({ origin: "http://localhost:3100" }),
          url: "http://localhost:3100/api/conversations",
        }),
      ),
      { ok: true },
    );
  });

  it("rejects cross-origin, wrong-port, and wrong-protocol origins", () => {
    for (const origin of [
      "http://evil.test:3100",
      "http://127.0.0.1:9999",
      "https://127.0.0.1:3100",
      "http://evil.test",
    ]) {
      const result = authorizeMutation(
        authedInput({ headers: new Headers({ origin }) }),
      );
      assert.deepEqual(result, {
        ok: false,
        status: 403,
        code: "FORBIDDEN",
        message: "Same-origin requests only",
      });
    }
  });

  it("rejects missing and malformed Origin headers", () => {
    for (const headers of [
      new Headers({}),
      new Headers({ origin: "" }),
      new Headers({ origin: "not a url" }),
      new Headers({ origin: "http://127.0.0.1:3100, http://evil.test" }),
    ]) {
      const result = authorizeMutation(authedInput({ headers }));
      assert.equal(result.ok, false);
      assert.equal(result.status, 403);
    }
  });

  it("rejects DNS-rebinding style matching non-loopback pairs", () => {
    const result = authorizeMutation(
      authedInput({
        headers: new Headers({ origin: "http://evil.test:3100" }),
        url: "http://evil.test:3100/api/dev-session",
      }),
    );
    assert.deepEqual(result, {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Same-origin requests only",
    });
  });

  it("rejects missing, unknown, and expired sessions", () => {
    assert.deepEqual(authorizeMutation(authedInput({ cookieHeader: null })), {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Developer sign-in required",
    });
    assert.deepEqual(authorizeMutation(authedInput({ cookieHeader: "other=1" })), {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Developer sign-in required",
    });
    assert.deepEqual(
      authorizeMutation(authedInput({ cookieHeader: `${SESSION_COOKIE_NAME}=nope` })),
      {
        ok: false,
        status: 401,
        code: "AUTH_REQUIRED",
        message: "Developer sign-in required",
      },
    );
    const { id } = createSession(1);
    assert.deepEqual(
      authorizeMutation(authedInput({ cookieHeader: `${SESSION_COOKIE_NAME}=${id}` })),
      {
        ok: false,
        status: 401,
        code: "AUTH_REQUIRED",
        message: "Developer sign-in required",
      },
    );
  });

  it("stays undiscoverable when disabled, including in production", () => {
    for (const env of [
      { ...baseEnv, BILLY_DEV_AUTH_ENABLED: "false" },
      { ...baseEnv, BILLY_DEV_AUTH_ENABLED: undefined },
      { ...baseEnv, NODE_ENV: "production" },
    ]) {
      assert.deepEqual(authorizeMutation(authedInput({ env })), {
        ok: false,
        status: 404,
        code: "NOT_FOUND",
        message: "Not found",
      });
    }
  });

  it("returns only safe fields, never credentials", () => {
    const result = authorizeMutation(authedInput({ cookieHeader: null }));
    assert.deepEqual(Object.keys(result).sort(), ["code", "message", "ok", "status"]);
    assert.ok(!JSON.stringify(result).includes(FIXTURE_SECRET));
  });
});
