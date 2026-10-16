import { notFound } from "next/navigation";
import { DevPreviewClient } from "./dev-preview-client";

/**
 * Development-only visual fidelity preview route.
 * Strictly 404s in production; handles zero network/provider requests.
 */
export default function DevPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <DevPreviewClient />;
}
