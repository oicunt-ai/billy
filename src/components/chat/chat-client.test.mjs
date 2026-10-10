/**
 * Tests for the SSE parser and completion stream runner.
 *
 * Run with: npm run test
 *
 * Transport is fully stubbed with real Response/ReadableStream objects:
 * no network, no provider, no database writes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SseParser,
  SseProtocolError,
  runCompletionStream,
} from "./chat-client.ts";
import { messageContentToText, toDisplayRole } from "./message-content.ts";

const encoder = new TextEncoder();

function tokenFrame(delta) {
  return `event: token\ndata: ${JSON.stringify({ delta })}\n\n`;
}

function finishFrame() {
  return `event: finish\ndata: ${JSON.stringify({
    finishReason: "stop",
    usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
  })}\n\n`;
}

function errorFrame(code = "TIMEOUT", message = "Timed out.") {
  return `event: error\ndata: ${JSON.stringify({ code, message })}\n\n`;
}

function streamResponse(chunks) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function splitAt(text, points) {
  const cuts = [0, ...points, text.length];
  const parts = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    parts.push(text.slice(cuts[i], cuts[i + 1]));
  }
  return parts;
}

describe("SseParser", () => {
  it("accumulates tokens split across arbitrary chunk boundaries", () => {
    const parser = new SseParser();
    const wire = `${tokenFrame("Hello")}${tokenFrame(" world")}${finishFrame()}`;
    const deltas = [];
    for (const chunk of splitAt(wire, [3, 7, 31, 32, 55])) {
      for (const event of parser.push(chunk)) {
        if (event.event === "token") {
          deltas.push(event.delta);
        }
      }
    }
    assert.deepEqual(deltas, ["Hello", " world"]);
  });

  it("handles CRLF endings, comments, and multiline data frames", () => {
    const parser = new SseParser();
    const pretty = '{\n"delta": "Hi"\n}';
    const wire =
      `: ping\n\nevent: token\r\ndata: ${JSON.stringify({ delta: "A" })}\r\n\r\n` +
      `event: token\ndata: ${pretty.split("\n").join("\ndata: ")}\n\n`;
    const deltas = [];
    for (const event of parser.push(wire)) {
      if (event.event === "token") {
        deltas.push(event.delta);
      }
    }
    assert.deepEqual(deltas, ["A", "Hi"]);
  });

  it("rejects malformed frames, payloads, and unknown events", () => {
    for (const wire of [
      `event: token\ndata: {oops}\n\n`,
      `event: token\ndata: ${JSON.stringify({ text: "x" })}\n\n`,
      `event: finish\ndata: ${JSON.stringify({ finishReason: "stop" })}\n\n`,
      `event: error\ndata: ${JSON.stringify({ code: "X" })}\n\n`,
      `event: tool_call\ndata: ${JSON.stringify({})}\n\n`,
      `bogus line\n\n`,
    ]) {
      assert.throws(() => new SseParser().push(wire), SseProtocolError, wire.slice(0, 30));
    }
  });
});

describe("runCompletionStream", () => {
  const body = { conversationId: "conv_1", model: "oicunt.model.test-alpha", message: "Hi" };

  it("streams tokens and completes on finish with one request", async () => {
    const calls = [];
    const deltas = [];
    const outcome = await runCompletionStream({
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return streamResponse(splitAt(`${tokenFrame("Hel")}${tokenFrame("lo")}${finishFrame()}`, [11, 40]));
      },
      body,
      onToken: (delta) => deltas.push(delta),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/completions");
    assert.deepEqual(deltas.join(""), "Hello");
    assert.deepEqual(outcome, { ok: true });
  });

  it("surfaces terminal error events and treats truncated streams as failures", async () => {
    const errored = await runCompletionStream({
      fetchFn: async () => streamResponse([tokenFrame("part"), errorFrame("MODEL_UNAVAILABLE", "Down.")]),
      body,
      onToken: () => {},
    });
    assert.deepEqual(errored, { ok: false, code: "MODEL_UNAVAILABLE", message: "Down." });

    const seen = [];
    const truncated = await runCompletionStream({
      fetchFn: async () => streamResponse([tokenFrame("partial")]),
      body,
      onToken: (delta) => seen.push(delta),
    });
    assert.deepEqual(seen, ["partial"]);
    assert.equal(truncated.ok, false);
    assert.equal(truncated.code, "STREAM_INTERRUPTED");
  });

  it("rejects protocol violations and maps HTTP errors without retrying", async () => {
    const calls = [];
    const malformed = await runCompletionStream({
      fetchFn: async (url, init) => {
        calls.push(init);
        return streamResponse([tokenFrame("ok"), "event: token\ndata: {bad}\n\n"]);
      },
      body,
      onToken: () => {},
    });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.code, "STREAM_PROTOCOL_ERROR");

    const httpCalls = [];
    const rejected = await runCompletionStream({
      fetchFn: async (url, init) => {
        httpCalls.push(init);
        return new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Bad." } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      },
      body,
      onToken: () => {},
    });
    assert.equal(httpCalls.length, 1);
    assert.deepEqual(rejected, { ok: false, code: "VALIDATION_ERROR", message: "Bad." });
  });

  it("reports cancellation and connection failures distinctly", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream({
      pull(c) {
        controller.abort();
        c.error(new DOMException("This operation was aborted", "AbortError"));
      },
    });
    const cancelled = await runCompletionStream({
      fetchFn: async () => new Response(stream, { status: 200 }),
      body,
      signal: controller.signal,
      onToken: () => {},
    });
    assert.deepEqual(cancelled, { ok: false, code: "ABORTED", message: "The request was cancelled." });

    const offline = await runCompletionStream({
      fetchFn: async () => {
        throw new TypeError("fetch failed");
      },
      body,
      onToken: () => {},
    });
    assert.deepEqual(offline, { ok: false, code: "CONNECTION_FAILED", message: "Could not reach BILLY." });
  });
});

describe("messageContentToText", () => {
  it("passes strings through and joins text parts", () => {
    assert.equal(messageContentToText("Hello\nWorld"), "Hello\nWorld");
    assert.equal(
      messageContentToText([
        { type: "text", text: "A" },
        { type: "text", text: "B" },
      ]),
      "AB",
    );
  });

  it("drops thinking and non-text parts without leaking reasoning", () => {
    assert.equal(
      messageContentToText([
        { type: "thinking", thinking: "secret reasoning" },
        { type: "tool_call", id: "t", name: "n", arguments: {} },
        { type: "image", mimeType: "image/png", data: "x" },
      ]),
      "",
    );
    const mixed = messageContentToText([
      { type: "text", text: "Keep " },
      { type: "thinking", thinking: "drop" },
      { type: "text", text: "this" },
      null,
      "stray",
      42,
    ]);
    assert.equal(mixed, "Keep this");
    assert.ok(!mixed.includes("drop"));
  });

  it("returns empty text for non-content values", () => {
    assert.equal(messageContentToText(null), "");
    assert.equal(messageContentToText(undefined), "");
    assert.equal(messageContentToText(42), "");
    assert.equal(messageContentToText({}), "");
    assert.equal(messageContentToText([]), "");
  });

  it("collapses roles onto user and assistant presentations", () => {
    assert.equal(toDisplayRole("user"), "user");
    assert.equal(toDisplayRole("assistant"), "assistant");
    assert.equal(toDisplayRole("system"), "assistant");
    assert.equal(toDisplayRole("tool"), "assistant");
    assert.equal(toDisplayRole(null), "assistant");
  });
});
