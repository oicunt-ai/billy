/**
 * Tests for Markdown code-rendering helpers.
 *
 * Run with: npm test
 *
 * Pure functions only: no DOM, no network, no provider.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codeTextOf, languageOf } from "./message-markdown-utils.ts";

describe("languageOf", () => {
  it("extracts the language from a code class list", () => {
    assert.equal(languageOf("language-typescript"), "typescript");
    assert.equal(languageOf("hljs language-bash"), "bash");
  });

  it("returns empty for missing or non-string classes", () => {
    assert.equal(languageOf(undefined), "");
    assert.equal(languageOf("hljs"), "");
  });
});

describe("codeTextOf", () => {
  it("joins strings, numbers and nested arrays", () => {
    assert.equal(codeTextOf("npm install"), "npm install");
    assert.equal(codeTextOf(42), "42");
    assert.equal(codeTextOf(["a", ["b", 1]]), "ab1");
  });

  it("drops elements, null and undefined", () => {
    assert.equal(codeTextOf(null), "");
    assert.equal(
      codeTextOf([{ type: "code", props: {} }]),
      "",
    );
  });
});
