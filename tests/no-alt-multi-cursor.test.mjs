import test from "node:test";
import assert from "node:assert/strict";
import { decideClickAddsSelectionRange } from "../src/modules/no-alt-multi-cursor-utils.ts";

test("never adds a selection range while enabled", () => {
  assert.equal(
    decideClickAddsSelectionRange(true, { altKey: true, ctrlKey: false, metaKey: false }),
    false,
  );
  assert.equal(
    decideClickAddsSelectionRange(true, { altKey: false, ctrlKey: false, metaKey: false }),
    false,
  );
  assert.equal(
    decideClickAddsSelectionRange(true, { altKey: true, ctrlKey: true, metaKey: true }),
    false,
  );
});

test("restores the Obsidian default judgment while disabled", () => {
  assert.equal(
    decideClickAddsSelectionRange(false, { altKey: true, ctrlKey: false, metaKey: false }),
    true,
  );
  assert.equal(
    decideClickAddsSelectionRange(false, { altKey: false, ctrlKey: false, metaKey: false }),
    false,
  );
  assert.equal(
    decideClickAddsSelectionRange(false, { altKey: true, ctrlKey: true, metaKey: false }),
    false,
  );
  assert.equal(
    decideClickAddsSelectionRange(false, { altKey: true, ctrlKey: false, metaKey: true }),
    false,
  );
});
