import test from "node:test";
import assert from "node:assert/strict";
import { ViewFoldTracker } from "./fold-properties-utils.ts";

test("folds a view the first time it loads a file", () => {
  const tracker = new ViewFoldTracker();
  const view = {};
  assert.equal(tracker.shouldFold(view, "1. Inbox/example.md"), true);
});

test("does not re-fold while the same file stays loaded in the view", () => {
  const tracker = new ViewFoldTracker();
  const view = {};
  tracker.markFolded(view, "1. Inbox/example.md");
  assert.equal(tracker.shouldFold(view, "1. Inbox/example.md"), false);
});

test("folds again when the view loads a different file", () => {
  const tracker = new ViewFoldTracker();
  const view = {};
  tracker.markFolded(view, "1. Inbox/example.md");
  assert.equal(tracker.shouldFold(view, "2. Hubs/topic.md"), true);
});

test("folds again when the view returns to a previously loaded file", () => {
  const tracker = new ViewFoldTracker();
  const view = {};
  tracker.markFolded(view, "1. Inbox/example.md");
  tracker.markFolded(view, "2. Hubs/topic.md");
  assert.equal(tracker.shouldFold(view, "1. Inbox/example.md"), true);
});

test("tracks views independently for the same file", () => {
  const tracker = new ViewFoldTracker();
  const viewA = {};
  const viewB = {};
  tracker.markFolded(viewA, "1. Inbox/example.md");
  assert.equal(tracker.shouldFold(viewB, "1. Inbox/example.md"), true);
  assert.equal(tracker.shouldFold(viewA, "1. Inbox/example.md"), false);
});
