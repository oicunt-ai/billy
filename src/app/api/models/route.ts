import { NextResponse } from "next/server";
import { requireDevSession } from "@/lib/bff-session";
import { GatewayModelsError, fetchModelCatalog } from "@/lib/gateway-models";

/**
 * Same-origin model catalog for the BILLY UI.
 *
 * Requires a valid development session, reads the Gateway JWT server-side,
 * and returns only the public projection. The JWT never appears here.
 */
export async function GET() {
  const denied = await requireDevSession();
  if (denied) {
    return denied;
  }
  // requireDevSession() reads the session cookie per request, keeping
  // this handler dynamic: the check is never prerendered or cached.
  try {
    const { models } = await fetchModelCatalog();
    return NextResponse.json(
      { models },
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
      { error: { code: "INTERNAL_ERROR", message: "Model catalog request failed" } },
      { status: 500 },
    );
  }
}
