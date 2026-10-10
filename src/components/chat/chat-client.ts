/**
 * Client-safe SSE handling for BILLY completions.
 *
 * Understands only the public Gateway stream contract:
 *   token  {delta} | finish {finishReason, usage} | error {code, message}
 * Internal orchestrator event types are deliberately rejected. No imports —
 * safe for browser components and plain Node tests alike.
 */

export type PublicStreamEvent =
  | { readonly event: "token"; readonly delta: string }
  | {
      readonly event: "finish";
      readonly finishReason: string;
      readonly usage: {
        readonly promptTokens: number;
        readonly completionTokens: number;
        readonly totalTokens: number;
      };
    }
  | { readonly event: "error"; readonly code: string; readonly message: string };

export class SseProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SseProtocolError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseFrame(frame: string): PublicStreamEvent | null {
  const eventLines: string[] = [];
  const dataLines: string[] = [];
  for (const rawLine of frame.split("\n")) {
    if (rawLine === "") {
      continue;
    }
    if (rawLine.startsWith(":")) {
      continue; // comments and heartbeats carry no payload
    }
    if (rawLine.startsWith("event:")) {
      eventLines.push(rawLine.slice("event:".length).trim());
    } else if (rawLine.startsWith("data:")) {
      let value = rawLine.slice("data:".length);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
      dataLines.push(value);
    } else {
      throw new SseProtocolError("Malformed SSE frame");
    }
  }
  if (eventLines.length === 0) {
    return null; // data-only frames are not part of the public contract
  }
  if (eventLines.length > 1) {
    throw new SseProtocolError("Malformed SSE frame");
  }
  const event = eventLines[0];
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    throw new SseProtocolError("Malformed SSE payload");
  }
  if (!isRecord(data)) {
    throw new SseProtocolError("Malformed SSE payload");
  }
  if (event === "token") {
    if (typeof data["delta"] !== "string") {
      throw new SseProtocolError("Malformed token event");
    }
    return { event: "token", delta: data["delta"] };
  }
  if (event === "finish") {
    const usage = data["usage"];
    if (
      typeof data["finishReason"] !== "string" ||
      !isRecord(usage) ||
      !["promptTokens", "completionTokens", "totalTokens"].every(
        (key) => typeof usage[key] === "number" && Number.isFinite(usage[key]),
      )
    ) {
      throw new SseProtocolError("Malformed finish event");
    }
    return {
      event: "finish",
      finishReason: data["finishReason"] as string,
      usage: {
        promptTokens: usage["promptTokens"] as number,
        completionTokens: usage["completionTokens"] as number,
        totalTokens: usage["totalTokens"] as number,
      },
    };
  }
  if (event === "error") {
    if (typeof data["code"] !== "string" || typeof data["message"] !== "string") {
      throw new SseProtocolError("Malformed error event");
    }
    return {
      event: "error",
      code: data["code"] as string,
      message: data["message"] as string,
    };
  }
  throw new SseProtocolError(`Unsupported SSE event '${event}'`);
}

/**
 * Incremental SSE parser. Chunk boundaries mean nothing: feed arbitrary
 * byte slices, receive complete events. Handles CRLF line endings and
 * multiline data frames.
 */
export class SseParser {
  private buffer = "";

  push(chunk: string): PublicStreamEvent[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const events: PublicStreamEvent[] = [];
    for (;;) {
      const boundary = this.buffer.indexOf("\n\n");
      if (boundary < 0) {
        break;
      }
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      if (frame.trim() === "") {
        continue;
      }
      const parsed = parseFrame(frame);
      if (parsed !== null) {
        events.push(parsed);
      }
    }
    return events;
  }
}

export interface CompletionRequestBody {
  readonly conversationId: string;
  readonly model: string;
  readonly message: string;
}

export interface RunCompletionInput {
  readonly fetchFn?: typeof fetch;
  readonly url?: string;
  readonly body: CompletionRequestBody;
  readonly signal?: AbortSignal;
  readonly onToken: (delta: string) => void;
}

export type CompletionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

function aborted(signal: AbortSignal | undefined, error: unknown): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function safeErrorPayload(body: unknown): { code: string; message: string } | null {
  if (!isRecord(body)) {
    return null;
  }
  const error = body["error"];
  if (!isRecord(error)) {
    return null;
  }
  if (typeof error["code"] !== "string" || typeof error["message"] !== "string") {
    return null;
  }
  return { code: error["code"], message: error["message"] };
}

/**
 * Run one completion stream: exactly one fetch, no retries. A successfully
 * opened stream is not success until a valid terminal `finish` arrives;
 * anything else is an honest failure — partial text is never presented as
 * finished.
 */
export async function runCompletionStream(
  input: RunCompletionInput,
): Promise<CompletionOutcome> {
  let response: Response;
  try {
    const fetchFn = input.fetchFn ?? fetch;
    response = await fetchFn(input.url ?? "/api/completions", {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    if (aborted(input.signal, error)) {
      return { ok: false, code: "ABORTED", message: "The request was cancelled." };
    }
    return { ok: false, code: "CONNECTION_FAILED", message: "Could not reach BILLY." };
  }

  if (!response.ok) {
    let code = "REQUEST_FAILED";
    let message = "The request failed.";
    try {
      const payload = safeErrorPayload(await response.json());
      if (payload !== null) {
        code = payload.code;
        message = payload.message;
      }
    } catch {
      // Keep the default failure.
    }
    return { ok: false, code, message };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, code: "STREAM_FAILED", message: "The response was unreadable." };
  }

  const parser = new SseParser();
  const decoder = new TextDecoder();
  let terminal = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let events: PublicStreamEvent[];
      try {
        events = parser.push(decoder.decode(value, { stream: true }));
      } catch (error) {
        if (error instanceof SseProtocolError) {
          return { ok: false, code: "STREAM_PROTOCOL_ERROR", message: error.message };
        }
        throw error;
      }
      for (const event of events) {
        if (terminal) {
          return {
            ok: false,
            code: "STREAM_PROTOCOL_ERROR",
            message: "The stream sent data after finishing.",
          };
        }
        if (event.event === "token") {
          input.onToken(event.delta);
        } else if (event.event === "finish") {
          terminal = true;
        } else {
          return { ok: false, code: event.code, message: event.message };
        }
      }
    }
  } catch (error) {
    if (aborted(input.signal, error)) {
      return { ok: false, code: "ABORTED", message: "The request was cancelled." };
    }
    return { ok: false, code: "STREAM_FAILED", message: "The connection was interrupted." };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader already released or cancelled.
    }
  }

  if (!terminal) {
    return {
      ok: false,
      code: "STREAM_INTERRUPTED",
      message: "The response stopped before finishing.",
    };
  }
  return { ok: true };
}
