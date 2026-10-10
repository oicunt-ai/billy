/**
 * Focused tests for the server-side model catalog client.
 *
 * Run with: npm run test
 *
 * The Gateway is fully stubbed: no network, no completions, no secrets.
 * Fixture tokens are throwaway values; assertions verify the real token
 * never appears in browser-bound output.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GATEWAY_MODELS_PATH,
  GatewayModelsError,
  fetchModelCatalog,
  resolveGatewayBaseUrl,
  resolveTokenFile,
} from "./gateway-models.ts";
import { isModelSelectable } from "../components/chat/model-utils.ts";

const FIXTURE_TOKEN = "fixture.dev.token";
const GATEWAY_URL = "http://127.0.0.1:3000";

function jsonResponse(status, body) {
  return {
    status,
    json: async () => body,
  };
}

function upstreamCatalog() {
  return {
    success: true,
    data: [
      {
        id: "oicunt.model.test-alpha",
        displayName: "Test Alpha",
        description: "A test model",
        capabilities: ["chat", "streaming", false, 42],
        status: "available",
        // Internal fields the Gateway projects away — and which the BFF
        // must never reintroduce.
        family: "test",
        pricing: { input: 1 },
        targets: ["t1"],
        provider: "test-provider",
        upstreamModelId: "secret-upstream-id",
      },
      {
        id: "oicunt.model.test-beta",
        displayName: "Test Beta",
        capabilities: [],
        status: "degraded",
      },
      { id: "", displayName: "Bad entry" },
    ],
  };
}

describe("gateway base URL", () => {
  it("accepts explicit http(s) URLs and rejects the rest", () => {
    assert.equal(resolveGatewayBaseUrl(GATEWAY_URL).origin, GATEWAY_URL);
    for (const bad of [undefined, "", "not-a-url", "ftp://x/", "http://user:pass@x/"]) {
      assert.throws(
        () => resolveGatewayBaseUrl(bad),
        (error) => error instanceof GatewayModelsError && error.status === 503,
        String(bad),
      );
    }
  });

  it("resolves the token file default and override", () => {
    const portable = (value) => value.replace(/\\/g, "/");
    assert.ok(portable(resolveTokenFile({})).endsWith(".dev-auth/token"));
    assert.equal(portable(resolveTokenFile({ BILLY_DEV_JWT_FILE: "custom/token" })).endsWith("custom/token"), true);
    assert.equal(
      portable(resolveTokenFile({ BILLY_DEV_JWT_FILE: "C:/tmp/external-token" })),
      "C:/tmp/external-token",
    );
  });
});

describe("fetchModelCatalog", () => {
  it("forwards to the fixed catalog path with a bearer token and projects public fields", async () => {
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, upstreamCatalog());
    };
    const { models } = await fetchModelCatalog({
      fetchFn,
      readTokenFile: async () => `${FIXTURE_TOKEN}\n`,
      gatewayUrl: GATEWAY_URL,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${GATEWAY_URL}${GATEWAY_MODELS_PATH}`);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${FIXTURE_TOKEN}`);
    // Only selectable-by-construction public entries with valid ids survive.
    assert.equal(models.length, 2);
    assert.deepEqual(Object.keys(models[0]).sort(), [
      "capabilities",
      "description",
      "displayName",
      "id",
      "status",
    ]);
    assert.deepEqual(models[0].capabilities, ["chat", "streaming"]);
    // The token must never appear in browser-bound output.
    assert.ok(!JSON.stringify({ models }).includes(FIXTURE_TOKEN));
  });

  it("maps gateway failures to safe errors without leaking details", async () => {
    const cases = [
      { status: 401, code: "TOKEN_REJECTED", http: 503 },
      { status: 403, code: "FORBIDDEN", http: 403 },
      { status: 500, code: "GATEWAY_ERROR", http: 502 },
    ];
    for (const { status, code, http } of cases) {
      const error = await fetchModelCatalog({
        fetchFn: async () => jsonResponse(status, { success: false }),
        readTokenFile: async () => FIXTURE_TOKEN,
        gatewayUrl: GATEWAY_URL,
      }).then(
        () => null,
        (failure) => failure,
      );
      assert.ok(error instanceof GatewayModelsError);
      assert.equal(error.code, code);
      assert.equal(error.status, http);
      assert.ok(!error.message.includes(FIXTURE_TOKEN));
    }
  });

  it("fails closed on missing credentials, transport errors, and malformed responses", async () => {
    const failing = [
      {
        name: "missing token file",
        deps: {
          fetchFn: async () => jsonResponse(200, upstreamCatalog()),
          readTokenFile: async () => {
            throw new Error("ENOENT");
          },
          gatewayUrl: GATEWAY_URL,
        },
        code: "TOKEN_UNAVAILABLE",
      },
      {
        name: "empty token",
        deps: {
          fetchFn: async () => jsonResponse(200, upstreamCatalog()),
          readTokenFile: async () => "  \n",
          gatewayUrl: GATEWAY_URL,
        },
        code: "TOKEN_UNAVAILABLE",
      },
      {
        name: "unreachable gateway",
        deps: {
          fetchFn: async () => {
            throw new Error("connect ECONNREFUSED");
          },
          readTokenFile: async () => FIXTURE_TOKEN,
          gatewayUrl: GATEWAY_URL,
        },
        code: "GATEWAY_UNREACHABLE",
      },
      {
        name: "timeout",
        deps: {
          fetchFn: async () => {
            const error = new Error("timed out");
            error.name = "TimeoutError";
            throw error;
          },
          readTokenFile: async () => FIXTURE_TOKEN,
          gatewayUrl: GATEWAY_URL,
        },
        code: "GATEWAY_TIMEOUT",
      },
      {
        name: "malformed json",
        deps: {
          fetchFn: async () => ({ status: 200, json: async () => JSON.parse("{oops") }),
          readTokenFile: async () => FIXTURE_TOKEN,
          gatewayUrl: GATEWAY_URL,
        },
        code: "BAD_RESPONSE",
      },
      {
        name: "non-array data envelope",
        deps: {
          fetchFn: async () => jsonResponse(200, { success: true, data: { models: [] } }),
          readTokenFile: async () => FIXTURE_TOKEN,
          gatewayUrl: GATEWAY_URL,
        },
        code: "BAD_RESPONSE",
      },
    ];
    for (const { name, deps, code } of failing) {
      const error = await fetchModelCatalog(deps).then(
        () => null,
        (failure) => failure,
      );
      assert.ok(error instanceof GatewayModelsError, name);
      assert.equal(error.code, code, name);
    }
  });
});

describe("model selectability", () => {
  it("enables only models the public catalog marks available", () => {
    const base = { id: "m", displayName: "M", capabilities: [], status: "" };
    assert.equal(isModelSelectable({ ...base, status: "available" }), true);
    assert.equal(isModelSelectable({ ...base, status: "degraded" }), true);
    for (const status of ["maintenance", "deprecated", "unknown", ""]) {
      assert.equal(isModelSelectable({ ...base, status }), false, status || "(empty)");
    }
  });
});
