import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  authorizeMutation,
  buildClearedCookie,
  checkLoginRateLimit,
  createSession,
  isDevAuthEnabled,
  isSameOriginRequest,
  revokeSession,
  verifyAccessSecret,
} from "@/lib/dev-auth";

function notFound() {
  // Hidden when disabled so production never advertises this mechanism.
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Not found" } },
    { status: 404 },
  );
}

/** Development-only browser login. Disabled unless explicitly enabled. */
export async function POST(req: NextRequest) {
  if (!isDevAuthEnabled()) {
    return notFound();
  }
  if (!isSameOriginRequest(req.headers, req.url)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Same-origin requests only" } },
      { status: 403 },
    );
  }
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const firstHop = forwardedFor.split(",")[0]?.trim();
  const client = firstHop === "" || firstHop === undefined ? "loopback" : firstHop;
  if (!checkLoginRateLimit(`login:${client}`)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid request" } },
      { status: 400 },
    );
  }
  const secret =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["secret"]
      : undefined;
  if (!verifyAccessSecret(secret)) {
    return NextResponse.json(
      { error: { code: "INVALID_SECRET", message: "Incorrect access secret" } },
      { status: 401 },
    );
  }
  const session = createSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

/** Development-only logout. Same-origin protected like all mutations. */
export async function DELETE(req: NextRequest) {
  const auth = authorizeMutation({
    headers: req.headers,
    url: req.url,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.code, message: auth.message } },
      { status: auth.status },
    );
  }
  revokeSession(req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null);
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", buildClearedCookie());
  return response;
}
