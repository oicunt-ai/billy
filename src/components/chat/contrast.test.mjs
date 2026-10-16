/**
 * Contrast regression tests for the BILLY monochrome theme.
 *
 * Run with: npm test
 *
 * Guards the Task 25BF findings: every text/background pair used by the
 * interface must meet WCAG AA (4.5:1 for normal text). Pure functions
 * only: no DOM, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio } from "./contrast.ts";

const AA = 4.5;

describe("monochrome theme contrast (WCAG AA)", () => {
  it("sidebar secondary text on black sidebar", () => {
    // zinc-400 on ink-950 (was zinc-500 at 4.07:1).
    assert.ok(contrastRatio("#a1a1aa", "#0b0b0c") >= AA);
  });

  it("primary text on main canvas", () => {
    assert.ok(contrastRatio("#171719", "#fafaf9") >= AA);
  });

  it("helper text on main canvas and raised surfaces", () => {
    assert.ok(contrastRatio("#696b70", "#fafaf9") >= AA);
    assert.ok(contrastRatio("#696b70", "#ffffff") >= AA);
  });

  it("code text on dark code surface", () => {
    assert.ok(contrastRatio("#f4f4f5", "#1f2023") >= AA);
  });

  it("sidebar primary text on black sidebar", () => {
    assert.ok(contrastRatio("#fafaf9", "#0b0b0c") >= AA);
  });
});
