/**
 * Regression tests for the model-picker rendering gate (Task 25BI/D1).
 *
 * Run with: npm test
 *
 * A JSX element is never null, so gating the selector behind a
 * JSX-null comparison hides the control in every state. The gate must
 * branch on the status value instead. Pure function tests only: no DOM,
 * no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isModelPickerNoteStatus } from "./model-utils.ts";

describe("isModelPickerNoteStatus", () => {
  it("shows a note for states without a usable selector", () => {
    assert.equal(isModelPickerNoteStatus("login-required"), true);
    assert.equal(isModelPickerNoteStatus("disabled"), true);
    assert.equal(isModelPickerNoteStatus("error"), true);
  });

  it("renders the selector while loading and when ready", () => {
    assert.equal(isModelPickerNoteStatus("loading"), false);
    assert.equal(isModelPickerNoteStatus("ready"), false);
  });
});
