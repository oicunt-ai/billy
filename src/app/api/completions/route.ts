import { NextResponse, type NextRequest } from "next/server";
import { authorizeMutation } from "@/lib/dev-auth";
import {
  GatewayModelsError,
  openCompletionStream,
  validateCompletionInput,
} from "@/lib/gateway-chat";

/**
 * Stream a completion upstream as SSE (development session required).
 *
 * Single attempt only: the request is forwarded once and the upstream
 * byte stream is piped back untouched. Client cancellation propagates via
 * the request signal. Nothing is retried — the turn may already persist.
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Completion request is invalid" } },
      { status: 400 },
    );
  }
  let input;
  try {
    input = validateCompletionInput(body);
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
    const upstream = await openCompletionStream({
      input,
      clientSignal: req.signal,
    });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof GatewayModelsError) {
      if (error.code === "CLIENT_ABORTED") {
        return new Response(null, { status: 499 });
      }
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Completion request failed" } },
      { status: 500 },
    );
  }
}
