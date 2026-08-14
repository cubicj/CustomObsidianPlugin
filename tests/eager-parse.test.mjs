import test from "node:test";
import assert from "node:assert/strict";
import { clampParseTarget, decideEagerParse } from "../src/modules/eager-parse-utils.ts";

test("skips when disabled or when the syntax tree is available", () => {
  assert.equal(
    decideEagerParse({ enabled: false, composing: false, treeAvailable: false }),
    "skip",
  );
  assert.equal(
    decideEagerParse({ enabled: false, composing: true, treeAvailable: false }),
    "skip",
  );
  assert.equal(
    decideEagerParse({ enabled: false, composing: false, treeAvailable: true }),
    "skip",
  );
  assert.equal(
    decideEagerParse({ enabled: false, composing: true, treeAvailable: true }),
    "skip",
  );
  assert.equal(
    decideEagerParse({ enabled: true, composing: false, treeAvailable: true }),
    "skip",
  );
  assert.equal(
    decideEagerParse({ enabled: true, composing: true, treeAvailable: true }),
    "skip",
  );
});

test("defers while composing when enabled and the syntax tree is unavailable", () => {
  assert.equal(
    decideEagerParse({ enabled: true, composing: true, treeAvailable: false }),
    "defer",
  );
});

test("forces parsing when enabled, not composing, and the syntax tree is unavailable", () => {
  assert.equal(
    decideEagerParse({ enabled: true, composing: false, treeAvailable: false }),
    "force",
  );
});

test("clamps parse targets to the document bounds", () => {
  assert.equal(clampParseTarget(25, 100), 25);
  assert.equal(clampParseTarget(150, 100), 100);
  assert.equal(clampParseTarget(0, 100), 0);
  assert.equal(clampParseTarget(25, 0), 0);
});

test("clamps negative or non-finite inputs to zero", () => {
  assert.equal(clampParseTarget(-1, 100), 0);
  assert.equal(clampParseTarget(Number.NaN, 100), 0);
  assert.equal(clampParseTarget(Number.POSITIVE_INFINITY, 100), 0);
  assert.equal(clampParseTarget(25, -1), 0);
  assert.equal(clampParseTarget(25, Number.NaN), 0);
  assert.equal(clampParseTarget(25, Number.POSITIVE_INFINITY), 0);
});
