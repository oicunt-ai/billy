import { NextResponse, type NextRequest } from "next/server";
import { authorizeMutation } from "@/lib/dev-auth";
import {
  GatewayModelsError,
  deleteConversation,
  updateConversation,
} from "@/lib/gateway-chat";

type RouteContext = { params: Promise<{ id: string }> };

function mutationDenied(req: NextRequest): NextResponse | null {
  const auth = authorizeMutation({
    headers: req.headers,
    url: req.url,
    cookieHeader: req.headers.get("cookie"),
  });
  if (auth.ok) {
    return null;
  }
  return NextResponse.json(
    { error: { code: auth.code, message: auth.message } },
    { status: auth.status },
  );
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof GatewayModelsError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Conversation update failed" } },
    { status: 500 },
  );
}

/**
 * Rename and/or pin one conversation (development session required).
 * Pin state is authoritative upstream, never browser-local.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const denied = mutationDenied(req);
  if (denied) {
    return denied;
  }
  const { id } = await params;
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text === "" ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Conversation update is invalid" } },
      { status: 400 },
    );
  }
  const record =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  try {
    const conversation = await updateConversation({
      conversationId: id,
      title: record["title"],
      pinned: record["pinned"],
    });
    return NextResponse.json(
      { conversation },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Delete one conversation (development session required). The Gateway
 * soft-deletes it upstream: it leaves the user's history but stays
 * recoverable, and BILLY never claims success before the server confirms.
 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const denied = mutationDenied(req);
  if (denied) {
    return denied;
  }
  const { id } = await params;
  try {
    const result = await deleteConversation({ conversationId: id });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
