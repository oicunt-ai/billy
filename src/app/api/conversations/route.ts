import { NextResponse, type NextRequest } from "next/server";
import { requireDevSession } from "@/lib/bff-session";
import { authorizeMutation } from "@/lib/dev-auth";
import {
  GatewayModelsError,
  createConversation,
  listConversations,
} from "@/lib/gateway-chat";

/**
 * Create a conversation upstream (development session required).
 *
 * Returns the server-generated conversation. BILLY creates one
 * conversation per chat and reuses its ID for every subsequent turn.
 */
export async function POST(req: NextRequest) {
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
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text === "" ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Conversation request is invalid" } },
      { status: 400 },
    );
  }
  const title =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)["title"]
      : undefined;
  try {
    const conversation = await createConversation({ title });
    return NextResponse.json(
      { conversation },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GatewayModelsError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Conversation creation failed" } },
      { status: 500 },
    );
  }
}

/**
 * List the authenticated user's conversations (development session
 * required). Returns the public projection only; server order preserved.
 */
export async function GET() {
  const denied = await requireDevSession();
  if (denied) {
    return denied;
  }
  try {
    const { conversations, total, hasMore } = await listConversations();
    return NextResponse.json(
      { conversations, total, hasMore },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GatewayModelsError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Conversation listing failed" } },
      { status: 500 },
    );
  }
}
