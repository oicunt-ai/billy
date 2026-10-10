/**
 * Shared development-session gate for BFF routes (server-only).
 *
 * Every BFF endpoint calls requireDevSession() first: disabled mechanism
 * stays undiscoverable (404), missing sessions fail closed (401).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  isDevAuthEnabled,
  isSessionValid,
} from "./dev-auth";

export async function requireDevSession(): Promise<NextResponse | null> {
  if (!isDevAuthEnabled()) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    );
  }
  // cookies() opts the calling handler into per-request rendering: the
  // session check must never be prerendered or cached.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!isSessionValid(sessionId)) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "Developer sign-in required" } },
      { status: 401 },
    );
  }
  return null;
}
