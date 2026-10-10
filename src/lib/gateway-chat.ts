/**
 * Server-only Platform Gateway client: conversations and completions.
 *
 * Uses the development JWT from a Git-ignored file, calls fixed Gateway
 * paths only, and surfaces safe errors. Completions are single-attempt by
 * construction: no loops, no retries — the backend may already have
 * persisted the turn. Never import this from client components.
 */

import { readFile } from "node:fs/promises";
import {
  GatewayModelsError,
  resolveGatewayBaseUrl,
  resolveTokenFile,
} from "./gateway-models.ts";
import { messageContentToText, toDisplayRole } from "../components/chat/message-content.ts";

if (typeof window !== "undefined") {
  throw new Error("src/lib/gateway-chat.ts is server-only");
}

export { GatewayModelsError };

/** Fixed Gateway paths. Never user-controlled. */
export const GATEWAY_CONVERSATIONS_PATH = "/api/v1/ai/conversations";
export const GATEWAY_COMPLETIONS_PATH = "/api/v1/ai/completions";

/**
 * Public OICUNT model identifier shape
 * (platform/packages/contracts/src/ai.ts: OICUNT_MODEL_ID_PATTERN).
 */
export const OICUNT_MODEL_ID_PATTERN =
  /^oicunt\.model\.[a-z0-9][a-z0-9._-]{0,47}$/;

const CONVERSATION_TIMEOUT_MS = 10_000;
/** Ceiling matching the orchestrator's default completion budget. */
const COMPLETION_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_TEXT_BYTES = 4 * 1024;

export const MAX_USER_MESSAGE_LENGTH = 8000;
const MAX_CONVERSATION_ID_LENGTH = 256;
const MAX_TITLE_LENGTH = 200;

export interface PublicConversation {
  readonly id: string;
  readonly title: string | null;
  readonly status: string;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ValidCompletionInput {
  readonly conversationId: string;
  readonly model: string;
  readonly message: string;
}

interface GatewayAuth {
  readonly baseUrl: URL;
  readonly token: string;
}

export interface ChatDeps {
  readonly fetchFn?: typeof fetch;
  readonly readTokenFile?: () => Promise<string>;
  readonly gatewayUrl?: string;
  readonly env?: NodeJS.ProcessEnv;
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  return typeof raw === "string" ? raw : undefined;
}

async function resolveGatewayAuth(deps: ChatDeps): Promise<GatewayAuth> {
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
  return { baseUrl, token };
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function readSafeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, MAX_RESPONSE_TEXT_BYTES);
  } catch {
    return "";
  }
}

/** Extract a public error code from a Gateway JSON error envelope, if any. */
function gatewayErrorCode(text: string): string | null {
  try {
    const body: unknown = JSON.parse(text);
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      const error = (body as Record<string, unknown>)["error"];
      if (error !== null && typeof error === "object" && !Array.isArray(error)) {
        const code = (error as Record<string, unknown>)["code"];
        if (typeof code === "string" && code !== "") {
          return code;
        }
      }
    }
  } catch {
    // Not JSON — no code to extract.
  }
  return null;
}

function mapStatus(
  status: number,
  errorText: string,
  action: string,
): GatewayModelsError {
  if (status === 401) {
    return new GatewayModelsError(
      503,
      "TOKEN_REJECTED",
      "Development credentials were rejected",
    );
  }
  if (status === 403) {
    return new GatewayModelsError(
      403,
      "FORBIDDEN",
      `${action} was denied`,
    );
  }
  if (status === 400 || status === 404 || status === 409) {
    const code = gatewayErrorCode(errorText) ?? "VALIDATION_ERROR";
    return new GatewayModelsError(status, code, `${action} was rejected`);
  }
  if (status === 429) {
    return new GatewayModelsError(
      429,
      "RATE_LIMITED",
      `${action} was rate limited`,
    );
  }
  return new GatewayModelsError(502, "GATEWAY_ERROR", `${action} failed`);
}

function toPublicConversation(data: unknown): PublicConversation {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Conversation response was unreadable",
    );
  }
  const record = data as Record<string, unknown>;
  // The ID is always server-generated upstream; it is validated here and
  // never invented.
  if (typeof record["id"] !== "string" || record["id"] === "") {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Conversation response was unreadable",
    );
  }
  return {
    id: record["id"],
    title: typeof record["title"] === "string" ? record["title"] : null,
    status: typeof record["status"] === "string" ? record["status"] : "active",
    messageCount:
      typeof record["messageCount"] === "number" ? record["messageCount"] : 0,
    createdAt: typeof record["createdAt"] === "string" ? record["createdAt"] : "",
    updatedAt: typeof record["updatedAt"] === "string" ? record["updatedAt"] : "",
  };
}

/**
 * Create a conversation upstream. The returned ID is the only ID BILLY
 * ever uses — one conversation per chat, never per message.
 */
export async function createConversation(
  deps: ChatDeps & { readonly title?: unknown },
): Promise<PublicConversation> {
  const { title, ...authDeps } = deps;
  if (
    title !== undefined &&
    (typeof title !== "string" || title.trim() === "" || title.length > MAX_TITLE_LENGTH)
  ) {
    throw new GatewayModelsError(
      400,
      "INVALID_REQUEST",
      "Conversation title is invalid",
    );
  }
  const { baseUrl, token } = await resolveGatewayAuth(authDeps);
  const url = new URL(GATEWAY_CONVERSATIONS_PATH, baseUrl);
  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(title === undefined ? {} : { title }),
      signal: AbortSignal.timeout(CONVERSATION_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new GatewayModelsError(
        504,
        "GATEWAY_TIMEOUT",
        "Conversation creation timed out",
      );
    }
    throw new GatewayModelsError(
      502,
      "GATEWAY_UNREACHABLE",
      "Conversation creation failed",
    );
  }
  if (!response.ok) {
    throw mapStatus(
      response.status,
      await readSafeErrorText(response),
      "Conversation creation",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Conversation response was unreadable",
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Conversation response was unreadable",
    );
  }
  return toPublicConversation((body as Record<string, unknown>)["data"]);
}

/**
 * Validate a BFF completion request before any upstream call. Pure and
 * unit-testable: invalid input throws 400 without touching the network.
 */
export function validateCompletionInput(body: unknown): ValidCompletionInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GatewayModelsError(
      400,
      "INVALID_REQUEST",
      "Completion request is invalid",
    );
  }
  const record = body as Record<string, unknown>;
  const conversationId = record["conversationId"];
  const model = record["model"];
  const message = record["message"];
  if (
    typeof conversationId !== "string" ||
    conversationId === "" ||
    conversationId.length > MAX_CONVERSATION_ID_LENGTH
  ) {
    throw new GatewayModelsError(
      400,
      "INVALID_REQUEST",
      "Completion request is invalid",
    );
  }
  if (typeof model !== "string" || !OICUNT_MODEL_ID_PATTERN.test(model)) {
    throw new GatewayModelsError(
      400,
      "INVALID_REQUEST",
      "Completion request is invalid",
    );
  }
  if (
    typeof message !== "string" ||
    message.trim() === "" ||
    message.length > MAX_USER_MESSAGE_LENGTH
  ) {
    throw new GatewayModelsError(
      400,
      "INVALID_REQUEST",
      "Completion request is invalid",
    );
  }
  return { conversationId, model, message };
}

export interface OpenStreamDeps extends ChatDeps {
  readonly input: ValidCompletionInput;
  /** Client abort propagates upstream; the ceiling bounds hung streams. */
  readonly clientSignal?: AbortSignal;
}

/**
 * Open a single upstream SSE completion. Exactly one fetch per call —
 * callers must not retry: the turn may already be persisted.
 */
export async function openCompletionStream(
  deps: OpenStreamDeps,
): Promise<Response> {
  const { input, clientSignal, ...authDeps } = deps;
  const { baseUrl, token } = await resolveGatewayAuth(authDeps);
  const url = new URL(GATEWAY_COMPLETIONS_PATH, baseUrl);
  const fetchFn = deps.fetchFn ?? fetch;
  const signals = clientSignal
    ? [clientSignal, AbortSignal.timeout(COMPLETION_TIMEOUT_MS)]
    : [AbortSignal.timeout(COMPLETION_TIMEOUT_MS)];
  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId: input.conversationId,
        model: input.model,
        // Only the new user message — the server hydrates history itself.
        messages: [{ role: "user", content: input.message }],
        stream: true,
        exposeReasoning: false,
      }),
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    if (clientSignal?.aborted) {
      throw new GatewayModelsError(499, "CLIENT_ABORTED", "Completion was cancelled");
    }
    if (isTimeout(error)) {
      throw new GatewayModelsError(
        504,
        "GATEWAY_TIMEOUT",
        "Completion request timed out",
      );
    }
    throw new GatewayModelsError(
      502,
      "GATEWAY_UNREACHABLE",
      "Completion request failed",
    );
  }
  if (!response.ok) {
    throw mapStatus(
      response.status,
      await readSafeErrorText(response),
      "Completion request",
    );
  }
  if (!response.body) {
    throw new GatewayModelsError(
      502,
      "BAD_RESPONSE",
      "Completion response was unreadable",
    );
  }
  return response;
}

/**
 * Validate a conversation identifier supplied by the browser. IDs are
 * server-generated (`conv_<32hex>`) but the check stays structural —
 * non-empty string within bounds — so future formats keep working.
 */
export function validateConversationId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.length > MAX_CONVERSATION_ID_LENGTH
  ) {
    throw new GatewayModelsError(
      400,
      "INVALID_REQUEST",
      "Conversation identifier is invalid",
    );
  }
  return value;
}

export interface ConversationList {
  readonly conversations: readonly PublicConversation[];
  readonly total: number;
  readonly hasMore: boolean;
}

async function gatewayGet(
  deps: ChatDeps,
  path: string,
  action: string,
  timeoutMs: number,
): Promise<unknown> {
  const { baseUrl, token } = await resolveGatewayAuth(deps);
  const url = new URL(path, baseUrl);
  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new GatewayModelsError(504, "GATEWAY_TIMEOUT", `${action} timed out`);
    }
    throw new GatewayModelsError(502, "GATEWAY_UNREACHABLE", `${action} failed`);
  }
  if (!response.ok) {
    throw mapStatus(response.status, await readSafeErrorText(response), action);
  }
  try {
    return await response.json();
  } catch {
    throw new GatewayModelsError(502, "BAD_RESPONSE", `${action} was unreadable`);
  }
}

/**
 * List the authenticated user's conversations. Server order is preserved;
 * the Gateway forwards no pagination parameters, so `hasMore` is honored
 * as reported and documented as a first-page window.
 */
export async function listConversations(deps: ChatDeps = {}): Promise<ConversationList> {
  const body = await gatewayGet(deps, GATEWAY_CONVERSATIONS_PATH, "Conversation listing", 10_000);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GatewayModelsError(502, "BAD_RESPONSE", "Conversation listing was unreadable");
  }
  const data = (body as Record<string, unknown>)["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new GatewayModelsError(502, "BAD_RESPONSE", "Conversation listing was unreadable");
  }
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record["conversations"])) {
    throw new GatewayModelsError(502, "BAD_RESPONSE", "Conversation listing was unreadable");
  }
  return {
    conversations: record["conversations"].map((entry) => toPublicConversation(entry)),
    total: typeof record["total"] === "number" ? record["total"] : 0,
    hasMore: record["hasMore"] === true,
  };
}

export interface HistoryMessage {
  readonly id: string;
  readonly turnId: string;
  readonly sequenceNumber: number;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: string;
}

export interface MessageHistory {
  readonly messages: readonly HistoryMessage[];
  readonly hasMore: boolean;
}

function toHistoryMessage(entry: unknown): HistoryMessage | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  if (typeof record["id"] !== "string" || record["id"] === "") {
    return null;
  }
  if (typeof record["turnId"] !== "string" || record["turnId"] === "") {
    return null;
  }
  if (
    typeof record["sequenceNumber"] !== "number" ||
    !Number.isFinite(record["sequenceNumber"])
  ) {
    return null;
  }
  if (typeof record["createdAt"] !== "string") {
    return null;
  }
  const content = messageContentToText(record["content"]);
  if (content === "") {
    return null;
  }
  return {
    id: record["id"],
    turnId: record["turnId"],
    sequenceNumber: record["sequenceNumber"],
    role: toDisplayRole(record["role"]),
    content,
    createdAt: record["createdAt"],
  };
}

/**
 * Fetch one conversation's messages. Returned in ascending sequence order;
 * the Gateway forwards no pagination parameters, so a true `hasMore`
 * means older messages exist beyond this first-page window.
 */
export async function listMessages(
  deps: ChatDeps & { readonly conversationId: unknown },
): Promise<MessageHistory> {
  const { conversationId, ...authDeps } = deps;
  const id = validateConversationId(conversationId);
  const body = await gatewayGet(
    authDeps,
    `${GATEWAY_CONVERSATIONS_PATH}/${encodeURIComponent(id)}/messages`,
    "Message listing",
    10_000,
  );
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GatewayModelsError(502, "BAD_RESPONSE", "Message listing was unreadable");
  }
  const data = (body as Record<string, unknown>)["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new GatewayModelsError(502, "BAD_RESPONSE", "Message listing was unreadable");
  }
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record["messages"])) {
    throw new GatewayModelsError(502, "BAD_RESPONSE", "Message listing was unreadable");
  }
  const messages: HistoryMessage[] = [];
  for (const entry of record["messages"]) {
    const message = toHistoryMessage(entry);
    if (message !== null) {
      messages.push(message);
    }
  }
  messages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return { messages, hasMore: record["hasMore"] === true };
}
