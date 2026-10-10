import { NextResponse, type NextRequest } from "next/server";
import { requireDevSession } from "@/lib/bff-session";
import {
  GatewayModelsError,
  listMessages,
  validateConversationId,
} from "@/lib/gateway-chat";

/**
 * Fetch one conversation's messages in sequence order (development
 * session required). Returns renderable ChatMessage entries only; the
 * Gateway forwards no pagination parameters, so `hasMore: true` means
 * older messages exist beyond this window.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireDevSession();
  if (denied) {
    return denied;
  }
  const { id } = await params;
  let conversationId: string;
  try {
    conversationId = validateConversationId(id);
  } catch (error) {
    if (error instanceof GatewayModelsError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    throw error;
  }
  try {
    const { messages, hasMore } = await listMessages({ conversationId });
    return NextResponse.json(
      { messages, hasMore },
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
      { error: { code: "INTERNAL_ERROR", message: "Message listing failed" } },
      { status: 500 },
    );
  }
}
