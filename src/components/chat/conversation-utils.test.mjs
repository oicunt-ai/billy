/**
 * Tests for the sidebar history helpers (Task 25BP).
 *
 * Run with: npm test
 *
 * Pure functions only: no DOM, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  conversationTitle,
  filterConversations,
  groupConversations,
} from "./conversation-utils.ts";

function conversation(id, { title = null, pinned = false } = {}) {
  return {
    id,
    title,
    status: "active",
    messageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pinned,
  };
}

describe("filterConversations", () => {
  it("matches titles case-insensitively and keeps list order", () => {
    const list = [conversation("a", { title: "Next.js auth" }), conversation("b", { title: "Trip" })];
    assert.deepEqual(
      filterConversations(list, "  NEXT ").map((entry) => entry.id),
      ["a"],
    );
  });

  it("returns the full list for an empty query and drops untitled rows", () => {
    const list = [conversation("a", { title: null }), conversation("b", { title: "Trip" })];
    assert.deepEqual(
      filterConversations(list, "   ").map((entry) => entry.id),
      ["a", "b"],
    );
    assert.deepEqual(
      filterConversations(list, "trip").map((entry) => entry.id),
      ["b"],
    );
  });
});

describe("groupConversations", () => {
  it("puts pinned rows first and preserves server order inside each group", () => {
    const list = [
      conversation("a"),
      conversation("b", { pinned: true }),
      conversation("c"),
      conversation("d", { pinned: true }),
    ];
    const { pinned, others } = groupConversations(list);
    assert.deepEqual(
      pinned.map((entry) => entry.id),
      ["b", "d"],
    );
    assert.deepEqual(
      others.map((entry) => entry.id),
      ["a", "c"],
    );
  });

  it("handles an all-pinned and an empty list", () => {
    assert.deepEqual(
      groupConversations([conversation("a", { pinned: true })]).others,
      [],
    );
    assert.deepEqual(groupConversations([]), { pinned: [], others: [] });
  });
});

describe("conversationTitle", () => {
  it("never renders an empty label", () => {
    assert.equal(conversationTitle(conversation("a", { title: "Trip" })), "Trip");
    assert.equal(conversationTitle(conversation("a", { title: null })), "Untitled conversation");
    assert.equal(conversationTitle(conversation("a", { title: "" })), "Untitled conversation");
  });
});
