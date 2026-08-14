import test from "node:test";
import assert from "node:assert/strict";
import { injectPropertiesFold } from "../src/modules/fold-properties-utils.ts";

test("builds minimal fold info for null input", () => {
  assert.deepEqual(injectPropertiesFold(null), { folds: [{ from: 0, to: 0 }] });
});

test("builds minimal fold info for undefined input", () => {
  assert.deepEqual(injectPropertiesFold(undefined), { folds: [{ from: 0, to: 0 }] });
});

test("adds a folds array while preserving unknown fields", () => {
  assert.deepEqual(injectPropertiesFold({ lines: 12 }), {
    lines: 12,
    folds: [{ from: 0, to: 0 }],
  });
});

test("passes through fold info that already collapses properties", () => {
  const info = { folds: [{ from: 0, to: 0 }, { from: 3, to: 5 }], lines: 20 };
  assert.deepEqual(injectPropertiesFold(info), info);
});

test("prepends the properties fold without mutating the input", () => {
  const info = { folds: [{ from: 3, to: 5 }], lines: 20 };
  const result = injectPropertiesFold(info);
  assert.deepEqual(result, {
    folds: [{ from: 0, to: 0 }, { from: 3, to: 5 }],
    lines: 20,
  });
  assert.deepEqual(info, { folds: [{ from: 3, to: 5 }], lines: 20 });
});
