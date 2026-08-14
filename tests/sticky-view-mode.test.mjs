import test from "node:test";
import assert from "node:assert/strict";
import { decideStickyViewMode } from "../src/modules/sticky-view-mode-utils.ts";

const sticky = { mode: "preview", source: false };

test("passes through non-object view states", () => {
  assert.deepEqual(decideStickyViewMode(null, sticky, true), { action: "pass" });
  assert.deepEqual(decideStickyViewMode(undefined, sticky, true), { action: "pass" });
  assert.deepEqual(decideStickyViewMode("markdown", sticky, true), { action: "pass" });
});

test("passes through non-markdown view types", () => {
  const viewState = { type: "pdf", state: { mode: "source" } };
  assert.deepEqual(decideStickyViewMode(viewState, sticky, true), { action: "pass" });
});

test("passes through markdown states without a string mode", () => {
  assert.deepEqual(decideStickyViewMode({ type: "markdown" }, sticky, true), { action: "pass" });
  assert.deepEqual(decideStickyViewMode({ type: "markdown", state: null }, sticky, true), {
    action: "pass",
  });
  assert.deepEqual(
    decideStickyViewMode({ type: "markdown", state: { mode: 3 } }, sticky, true),
    { action: "pass" },
  );
});

test("records mode and source from a normal markdown write", () => {
  const viewState = { type: "markdown", state: { file: "a.md", mode: "source", source: true } };
  assert.deepEqual(decideStickyViewMode(viewState, null, true), {
    action: "record",
    snapshot: { mode: "source", source: true },
  });
});

test("records with source defaulting to false when absent", () => {
  const viewState = { type: "markdown", state: { mode: "preview" } };
  assert.deepEqual(decideStickyViewMode(viewState, sticky, true), {
    action: "record",
    snapshot: { mode: "preview", source: false },
  });
});

test("records even when the feature is disabled", () => {
  const viewState = { type: "markdown", state: { mode: "source", source: false } };
  assert.deepEqual(decideStickyViewMode(viewState, sticky, false), {
    action: "record",
    snapshot: { mode: "source", source: false },
  });
});

test("coerces a history restore to the sticky snapshot", () => {
  const viewState = {
    type: "markdown",
    popstate: true,
    state: { file: "a.md", mode: "source", source: true },
  };
  assert.deepEqual(decideStickyViewMode(viewState, sticky, true), {
    action: "coerce",
    snapshot: { mode: "preview", source: false },
  });
});

test("ignores a popstate flag inside the inner state bag", () => {
  const viewState = { type: "markdown", state: { mode: "source", popstate: true } };
  assert.deepEqual(decideStickyViewMode(viewState, sticky, true), {
    action: "record",
    snapshot: { mode: "source", source: false },
  });
});

test("passes through a history restore when no snapshot exists", () => {
  const viewState = { type: "markdown", popstate: true, state: { mode: "source" } };
  assert.deepEqual(decideStickyViewMode(viewState, null, true), { action: "pass" });
});

test("passes through a history restore when disabled", () => {
  const viewState = { type: "markdown", popstate: true, state: { mode: "source" } };
  assert.deepEqual(decideStickyViewMode(viewState, sticky, false), { action: "pass" });
});

test("does not mutate the input view state", () => {
  const viewState = { type: "markdown", popstate: true, state: { mode: "source", source: true } };
  decideStickyViewMode(viewState, sticky, true);
  assert.deepEqual(viewState, {
    type: "markdown",
    popstate: true,
    state: { mode: "source", source: true },
  });
});
