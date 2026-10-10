/**
 * Server-only Platform Gateway client: authenticated model catalog only.
 *
 * Reads the development JWT from a Git-ignored file, calls one fixed
 * Gateway endpoint, and returns a sanitized public projection. The JWT
 * never leaves the server: it appears in neither return values nor logs.
 * Never import this from client components.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PublicModel } from "@/components/chat/model-utils";

if (typeof window !== "undefined") {
  throw new Error("src/lib/gateway-models.ts is server-only");
}

export type { PublicModel } from "@/components/chat/model-utils";

export class GatewayModelsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GatewayModelsError";
    this.status = status;
    this.code = code;
  }
}

/** The only Gateway path this module may request. Not user-controlled. */
export const GATEWAY_MODELS_PATH = "/api/v1/ai/models";

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_TOKEN_FILE = ".dev-auth/token";

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  return typeof raw === "string" ? raw : undefined;
}

export function resolveGatewayBaseUrl(raw: string | undefined): URL {
  const value = (raw ?? "").trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayModelsError(
      503,
      "GATEWAY_CONFIG",
      "Model catalog is not configured",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GatewayModelsError(
      503,
      "GATEWAY_CONFIG",
      "Model catalog is not configured",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new GatewayModelsError(
      503,
      "GATEWAY_CONFIG",
      "Model catalog is not configured",
    );
  }
  return url;
}

export function resolveTokenFile(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (envValue(env, "BILLY_DEV_JWT_FILE") ?? "").trim();
  const relative = configured === "" ? DEFAULT_TOKEN_FILE : configured;
  if (path.isAbsolute(relative)) {
    return path.normalize(relative);
  }
  const normalized = path.normalize(relative);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new GatewayModelsError(
      503,
      "GATEWAY_CONFIG",
      "Model catalog is not configured",
    );
  }
  // Dev-only credential lookup; the ignore hint keeps Turbopack from
  // tracing the whole project for this single validated relative path.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), normalized);
}

export interface FetchCatalogDeps {
  readonly fetchFn?: typeof fetch;
  readonly readTokenFile?: () => Promise<string>;
  readonly gatewayUrl?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export async function fetchModelCatalog(
  deps: FetchCatalogDeps = {},
): Promise<{ readonly models: readonly PublicModel[] }> {
  const env = deps.env ?? process.env;
  const baseUrl = resolveGatewayBaseUrl(
    deps.gatewayUrl ?? envValue(env, "OICUNT_PLATFORM_GATEWAY_URL"),
  );

  let token: string;
  try {
    const raw = deps.readTokenFile
      ? await deps.readTokenFile()
      : await readFile(resolveTokenFile(env), "utf8");
    token = raw.trim();
  } catch {
    throw new GatewayModelsError(
      503,
      "TOKEN_UNAVAILABLE",
      "Development credentials are unavailable",
    );
  }
  if (token === "" || token.split(".").length !== 3) {
    throw new GatewayModelsError(
      503,
      "TOKEN_UNAVAILABLE",
      "Development credentials are unavailable",
    );
  }

  const url = new URL(GATEWAY_MODELS_PATH, baseUrl);
  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new GatewayModelsError(
        504,
        "GATEWAY_TIMEOUT",
        "Model catalog request timed out",
      );
    }
    throw new GatewayModelsError(
      502,
      "GATEWAY_UNREACHABLE",
      "Model catalog is unreachable",
    );
  }

  if (response.status === 401) {
    // Fail closed: the Gateway does not trust this key (e.g. the issuer
    // was restarted after the Gateway cached the previous JWKS — the
    // Gateway throttles JWKS refetches, so this can persist for minutes).
    throw new GatewayModelsError(
      503,
      "TOKEN_REJECTED",
      "Development credentials were rejected",
    );
  }
  if (response.status === 403) {
    throw new GatewayModelsError(
      403,
      "FORBIDDEN",
      "Access to the model catalog was denied",
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new GatewayModelsError(
      502,
      "GATEWAY_ERROR",
      "Model catalog request failed",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Model catalog response was unreadable",
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Model catalog response was unreadable",
    );
  }
  const data = (body as Record<string, unknown>)["data"];
  if (!Array.isArray(data)) {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Model catalog response was unreadable",
    );
  }

  const models: PublicModel[] = [];
  for (const entry of data) {
    const model = toPublicModel(entry);
    if (model !== null) {
      models.push(model);
    }
  }
  return { models };
}

/** Strict allowlist projection — internal fields can never pass through. */
function toPublicModel(entry: unknown): PublicModel | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  if (typeof record["id"] !== "string" || record["id"] === "") {
    return null;
  }
  if (typeof record["displayName"] !== "string" || record["displayName"] === "") {
    return null;
  }
  if (typeof record["status"] !== "string") {
    return null;
  }
  const capabilities = Array.isArray(record["capabilities"])
    ? record["capabilities"].filter(
        (capability): capability is string => typeof capability === "string",
      )
    : [];
  const model: PublicModel = {
    id: record["id"],
    displayName: record["displayName"],
    capabilities,
    status: record["status"],
  };
  if (
    typeof record["description"] === "string" &&
    record["description"] !== ""
  ) {
    return { ...model, description: record["description"] };
  }
  return model;
}
