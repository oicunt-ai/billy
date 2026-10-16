/**
 * Tests for the server-side conversation/completion client.
 *
 * Run with: npm run test
 *
 * Upstream is fully stubbed: no network, no provider, no database writes.
 * Fixture tokens are throwaway values.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GATEWAY_COMPLETIONS_PATH,
  GATEWAY_CONVERSATIONS_PATH,
  GatewayModelsError,
  MAX_USER_MESSAGE_LENGTH,
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  openCompletionStream,
  updateConversation,
  validateCompletionInput,
  validateConversationId,
} from "./gateway-chat.ts";

const FIXTURE_TOKEN = "fixture.dev.token";
const GATEWAY_URL = "http://127.0.0.1:3000";
const MODEL = "oicunt.model.test-alpha";
const CONVERSATION_ID = "conv_abc123";

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function upstreamConversation() {
  return {
    success: true,
    data: {
      id: "conv_server_generated",
      title: null,
      status: "active",
      messageCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      pinned: true,
      tenantId: "hidden-tenant",
      internalNotes: "must not pass through",
    },
  };
}

describe("createConversation", () => {
  it("uses the server-generated ID and projects safe fields only", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, upstreamConversation());
    };
    const conversation = await createConversation({
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${GATEWAY_URL}${GATEWAY_CONVERSATIONS_PATH}`);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${FIXTURE_TOKEN}`);
    const sent = JSON.parse(calls[0].init.body);
    assert.deepEqual(sent, {});
    assert.ok(!("id" in sent) && !("conversationId" in sent));
    assert.equal(conversation.id, "conv_server_generated");
    assert.equal(conversation.pinned, true);
    assert.deepEqual(Object.keys(conversation).sort(), [
      "createdAt",
      "id",
      "messageCount",
      "pinned",
      "status",
      "title",
      "updatedAt",
    ]);
  });

  it("forwards a valid title and rejects bad ones without calling upstream", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return jsonResponse(200, upstreamConversation());
    };
    const base = {
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
    };
    await createConversation({ ...base, title: "My chat" });
    assert.equal(calls, 1);
    for (const title of ["", "   ", "x".repeat(201), 42]) {
      await assert.rejects(
        createConversation({ ...base, title }),
        (error) => error instanceof GatewayModelsError && error.status === 400,
        JSON.stringify(title)?.slice(0, 20),
      );
    }
    assert.equal(calls, 1);
  });

  it("maps upstream failures and rejects responses without an ID", async () => {
    const base = { readTokenFile: async () => FIXTURE_TOKEN, gatewayUrl: GATEWAY_URL };
    const unauthorized = await createConversation({
      ...base,
      fetchFn: async () => jsonResponse(401, { success: false }),
    }).then(
      () => null,
      (error) => error,
    );
    assert.ok(unauthorized instanceof GatewayModelsError);
    assert.equal(unauthorized.code, "TOKEN_REJECTED");
    const missingId = await createConversation({
      ...base,
      fetchFn: async () => jsonResponse(200, { success: true, data: { title: "x" } }),
    }).then(
      () => null,
      (error) => error,
    );
    assert.ok(missingId instanceof GatewayModelsError);
    assert.equal(missingId.code, "BAD_RESPONSE");
  });
});

describe("validateCompletionInput", () => {
  it("accepts a well-formed request", () => {
    assert.deepEqual(
      validateCompletionInput({ conversationId: CONVERSATION_ID, model: MODEL, message: "hi" }),
      { conversationId: CONVERSATION_ID, model: MODEL, message: "hi" },
    );
  });

  it("rejects malformed requests without touching the network", () => {
    const bad = [
      null,
      "nope",
      [],
      {},
      { conversationId: "", model: MODEL, message: "hi" },
      { conversationId: CONVERSATION_ID, model: "gpt-4", message: "hi" },
      { conversationId: CONVERSATION_ID, model: "oicunt.model.UPPER", message: "hi" },
      { conversationId: CONVERSATION_ID, model: MODEL, message: "" },
      { conversationId: CONVERSATION_ID, model: MODEL, message: "   " },
      { conversationId: CONVERSATION_ID, model: MODEL, message: "x".repeat(MAX_USER_MESSAGE_LENGTH + 1) },
      { conversationId: CONVERSATION_ID, model: MODEL },
    ];
    for (const body of bad) {
      assert.throws(
        () => validateCompletionInput(body),
        (error) => error instanceof GatewayModelsError && error.status === 400,
      );
    }
  });
});

describe("openCompletionStream", () => {
  const input = { conversationId: CONVERSATION_ID, model: MODEL, message: "Hello" };

  it("submits only the new user message with streaming enabled", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return { status: 200, ok: true, body: "stream" };
    };
    const response = await openCompletionStream({
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      input,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${GATEWAY_URL}${GATEWAY_COMPLETIONS_PATH}`);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${FIXTURE_TOKEN}`);
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.stream, true);
    assert.equal(sent.exposeReasoning, false);
    assert.equal(sent.conversationId, CONVERSATION_ID);
    assert.equal(sent.model, MODEL);
    assert.equal(sent.messages.length, 1);
    assert.deepEqual(sent.messages[0], { role: "user", content: "Hello" });
    assert.equal(response.body, "stream");
  });

  it("propagates the client abort signal and maps cancellation without retry", async () => {
    const calls = [];
    const controller = new AbortController();
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      controller.abort();
      throw new DOMException("This operation was aborted", "AbortError");
    };
    const error = await openCompletionStream({
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      input,
      clientSignal: controller.signal,
    }).then(
      () => null,
      (failure) => failure,
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    assert.ok(error instanceof GatewayModelsError);
    assert.equal(error.code, "CLIENT_ABORTED");
  });

  it("maps gateway rejections with a single attempt", async () => {
    const calls = [];
    const error = await openCompletionStream({
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(400, { success: false, error: { code: "VALIDATION_ERROR" } });
      },
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      input,
    }).then(
      () => null,
      (failure) => failure,
    );
    assert.equal(calls.length, 1);
    assert.ok(error instanceof GatewayModelsError);
    assert.equal(error.status, 400);
  });
});

function upstreamConversationList() {
  return {
    success: true,
    data: {
      conversations: [
        {
          id: "conv_1",
          title: "First",
          status: "active",
          messageCount: 4,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          pinned: true,
          tenantId: "hidden-tenant",
          userId: "hidden-user",
        },
        {
          id: "conv_2",
          title: null,
          status: "active",
          messageCount: 0,
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      total: 2,
      hasMore: false,
    },
  };
}

function upstreamMessages() {
  return {
    success: true,
    data: {
      messages: [
        {
          id: "msg_b",
          conversationId: "conv_1",
          turnId: "turn_1",
          sequenceNumber: 2,
          role: "assistant",
          content: "World",
          createdAt: "2026-01-01T00:00:02.000Z",
          tokenEstimate: 3,
          metadata: { model: "hidden-model" },
        },
        {
          id: "msg_a",
          conversationId: "conv_1",
          turnId: "turn_1",
          sequenceNumber: 1,
          role: "user",
          content: "Hello",
          createdAt: "2026-01-01T00:00:01.000Z",
        },
        {
          id: "msg_c",
          conversationId: "conv_1",
          turnId: "turn_2",
          sequenceNumber: 3,
          role: "assistant",
          content: [
            { type: "text", text: "Structured " },
            { type: "thinking", thinking: "must stay hidden" },
            { type: "text", text: "reply" },
            { type: "tool_call", id: "t", name: "n", arguments: {} },
          ],
          createdAt: "2026-01-01T00:00:03.000Z",
        },
        {
          id: "msg_empty",
          conversationId: "conv_1",
          turnId: "turn_2",
          sequenceNumber: 4,
          role: "assistant",
          content: [{ type: "image", mimeType: "image/png", data: "x" }],
          createdAt: "2026-01-01T00:00:04.000Z",
        },
        { id: "", conversationId: "conv_1", turnId: "t", sequenceNumber: 5, role: "user", content: "bad", createdAt: "x" },
      ],
      hasMore: true,
    },
  };
}

describe("updateConversation", () => {
  it("PATCHes only the given fields and projects the server copy", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, {
        success: true,
        data: { ...upstreamConversation().data, title: "Renamed" },
      });
    };
    const base = {
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
    };

    const renamed = await updateConversation({
      ...base,
      conversationId: CONVERSATION_ID,
      title: "  Renamed  ",
    });
    assert.equal(calls[0].url, `${GATEWAY_URL}${GATEWAY_CONVERSATIONS_PATH}/${CONVERSATION_ID}`);
    assert.equal(calls[0].init.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[0].init.body), { title: "Renamed" });
    assert.equal(renamed.title, "Renamed");

    const pinned = await updateConversation({
      ...base,
      conversationId: CONVERSATION_ID,
      pinned: false,
    });
    assert.deepEqual(JSON.parse(calls[1].init.body), { pinned: false });
    assert.equal(pinned.pinned, true);
  });

  it("rejects invalid updates without calling upstream", async () => {
    let calls = 0;
    const base = {
      fetchFn: async () => {
        calls += 1;
        return jsonResponse(200, upstreamConversation());
      },
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      conversationId: CONVERSATION_ID,
    };
    const bad = [
      {},
      { title: "" },
      { title: "   " },
      { title: "x".repeat(201) },
      { title: 42 },
      { pinned: "yes" },
    ];
    for (const patch of bad) {
      await assert.rejects(
        updateConversation({ ...base, ...patch }),
        (error) => error instanceof GatewayModelsError && error.status === 400,
        JSON.stringify(patch),
      );
    }
    await assert.rejects(
      updateConversation({ ...base, conversationId: "", title: "x" }),
      (error) => error instanceof GatewayModelsError && error.status === 400,
    );
    assert.equal(calls, 0);
  });

  it("maps a rejected update and unreadable replies", async () => {
    const base = {
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      conversationId: CONVERSATION_ID,
      title: "x",
    };
    const forbidden = await updateConversation({
      ...base,
      fetchFn: async () =>
        jsonResponse(404, { success: false, error: { code: "VALIDATION_ERROR" } }),
    }).then(
      () => null,
      (error) => error,
    );
    assert.ok(forbidden instanceof GatewayModelsError);
    assert.equal(forbidden.status, 404);
    const unreadable = await updateConversation({
      ...base,
      fetchFn: async () => jsonResponse(200, { success: true }),
    }).then(
      () => null,
      (error) => error,
    );
    assert.ok(unreadable instanceof GatewayModelsError);
    assert.equal(unreadable.code, "BAD_RESPONSE");
  });
});

describe("deleteConversation", () => {
  it("DELETEs the fixed path and confirms the server's answer", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, {
        success: true,
        data: { deleted: true, conversationId: CONVERSATION_ID, hard: false },
      });
    };
    const result = await deleteConversation({
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      conversationId: CONVERSATION_ID,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${GATEWAY_URL}${GATEWAY_CONVERSATIONS_PATH}/${CONVERSATION_ID}`);
    assert.equal(calls[0].init.method, "DELETE");
    assert.equal(calls[0].init.body, undefined);
    assert.deepEqual(result, { deleted: true, conversationId: CONVERSATION_ID });
  });

  it("never reports success on a partial or failed response", async () => {
    const base = {
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      conversationId: CONVERSATION_ID,
    };
    const partial = await deleteConversation({
      ...base,
      fetchFn: async () => jsonResponse(200, { success: true, data: { deleted: true } }),
    }).then(
      () => null,
      (error) => error,
    );
    assert.ok(partial instanceof GatewayModelsError);
    assert.equal(partial.code, "BAD_RESPONSE");
    const denied = await deleteConversation({
      ...base,
      fetchFn: async () =>
        jsonResponse(403, { success: false, error: { code: "FORBIDDEN" } }),
    }).then(
      () => null,
      (error) => error,
    );
    assert.ok(denied instanceof GatewayModelsError);
    assert.equal(denied.status, 403);
  });
});

describe("validateConversationId", () => {
  it("accepts server-shaped IDs and rejects the rest without network", () => {
    assert.equal(validateConversationId("conv_abc123"), "conv_abc123");
    for (const bad of ["", null, undefined, 42, {}, "x".repeat(257)]) {
      assert.throws(
        () => validateConversationId(bad),
        (error) => error instanceof GatewayModelsError && error.status === 400,
      );
    }
  });
});

describe("listConversations", () => {
  it("forwards a fixed GET and projects safe public fields", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, upstreamConversationList());
    };
    const result = await listConversations({
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${GATEWAY_URL}${GATEWAY_CONVERSATIONS_PATH}`);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${FIXTURE_TOKEN}`);
    assert.equal(result.conversations.length, 2);
    assert.equal(result.total, 2);
    assert.equal(result.hasMore, false);
    assert.deepEqual(Object.keys(result.conversations[0]).sort(), [
      "createdAt",
      "id",
      "messageCount",
      "pinned",
      "status",
      "title",
      "updatedAt",
    ]);
    assert.equal(result.conversations[0].pinned, true);
    assert.equal(result.conversations[1].pinned, false);
    assert.ok(!JSON.stringify(result).includes(FIXTURE_TOKEN));
    assert.ok(!JSON.stringify(result).includes("hidden-tenant"));
  });

  it("rejects malformed envelopes and maps failures", async () => {
    const base = { readTokenFile: async () => FIXTURE_TOKEN, gatewayUrl: GATEWAY_URL };
    const empty = await listConversations({
      ...base,
      fetchFn: async () => jsonResponse(200, { success: true, data: {} }),
    }).then(
      () => null,
      (failure) => failure,
    );
    assert.ok(empty instanceof GatewayModelsError);
    assert.equal(empty.code, "BAD_RESPONSE");
    const denied = await listConversations({
      ...base,
      fetchFn: async () => jsonResponse(401, { success: false }),
    }).then(
      () => null,
      (failure) => failure,
    );
    assert.ok(denied instanceof GatewayModelsError);
    assert.equal(denied.code, "TOKEN_REJECTED");
  });
});

describe("listMessages", () => {
  it("encodes the ID into the fixed path and normalizes in sequence order", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, upstreamMessages());
    };
    const result = await listMessages({
      fetchFn,
      readTokenFile: async () => FIXTURE_TOKEN,
      gatewayUrl: GATEWAY_URL,
      conversationId: "conv_1",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${GATEWAY_URL}/api/v1/ai/conversations/conv_1/messages`);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${FIXTURE_TOKEN}`);
    assert.equal(result.hasMore, true);
    assert.deepEqual(
      result.messages.map((m) => [m.sequenceNumber, m.role, m.content]),
      [
        [1, "user", "Hello"],
        [2, "assistant", "World"],
        [3, "assistant", "Structured reply"],
      ],
    );
    assert.ok(!JSON.stringify(result).includes("hidden-model"));
    assert.ok(!JSON.stringify(result).includes("must stay hidden"));
    assert.ok(!JSON.stringify(result).includes(FIXTURE_TOKEN));
  });

  it("encodes special characters and rejects bad IDs before fetching", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, { success: true, data: { messages: [], hasMore: false } });
    };
    const base = { fetchFn, readTokenFile: async () => FIXTURE_TOKEN, gatewayUrl: GATEWAY_URL };
    await listMessages({ ...base, conversationId: "conv a/b" });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/v1/ai/conversations/conv%20a%2Fb/messages"));
    for (const bad of ["", null, "x".repeat(257)]) {
      await assert.rejects(
        listMessages({ ...base, conversationId: bad }),
        (error) => error instanceof GatewayModelsError && error.status === 400,
      );
    }
    assert.equal(calls.length, 1);
  });

  it("maps unknown conversations and transport failures", async () => {
    const base = { readTokenFile: async () => FIXTURE_TOKEN, gatewayUrl: GATEWAY_URL };
    const missing = await listMessages({
      ...base,
      fetchFn: async () =>
        jsonResponse(404, { success: false, error: { code: "VALIDATION_ERROR" } }),
      conversationId: "conv_missing",
    }).then(
      () => null,
      (failure) => failure,
    );
    assert.ok(missing instanceof GatewayModelsError);
    assert.equal(missing.status, 404);
    const down = await listMessages({
      ...base,
      fetchFn: async () => {
        throw new Error("connect ECONNREFUSED");
      },
      conversationId: "conv_1",
    }).then(
      () => null,
      (failure) => failure,
    );
    assert.ok(down instanceof GatewayModelsError);
    assert.equal(down.code, "GATEWAY_UNREACHABLE");
  });
});
