import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeadingSignatures,
  collectCurrentHeadings,
  remapFoldEntry,
} from "./fold-remap-utils.ts";

function cacheHeading(line, level, text) {
  return { heading: text, level, position: { start: { line }, end: { line } } };
}

test("collectCurrentHeadings maps cache headings and skips malformed entries", () => {
  assert.deepEqual(
    collectCurrentHeadings([
      cacheHeading(2, 1, "Alpha"),
      null,
      { heading: "NoLevel", position: { start: { line: 4 } } },
      { heading: "NoLine", level: 2, position: {} },
      cacheHeading(6, 3, "Beta"),
    ]),
    [
      { line: 2, level: 1, text: "Alpha" },
      { line: 6, level: 3, text: "Beta" },
    ],
  );
  assert.deepEqual(collectCurrentHeadings(undefined), []);
  assert.deepEqual(collectCurrentHeadings("junk"), []);
});

test("buildHeadingSignatures signs only folds sitting on heading lines", () => {
  const headings = [
    { line: 2, level: 1, text: "Alpha" },
    { line: 8, level: 2, text: "Beta" },
    { line: 11, level: 1, text: "Alpha" },
  ];
  assert.deepEqual(
    buildHeadingSignatures(
      [
        { from: 0, to: 0 },
        { from: 2, to: 6 },
        { from: 5, to: 7 },
        { from: 8, to: 12 },
        { from: 11, to: 14 },
        { from: "bad", to: 1 },
      ],
      headings,
    ),
    [
      { from: 2, level: 1, text: "Alpha", occurrence: 0 },
      { from: 8, level: 2, text: "Beta", occurrence: 0 },
      { from: 11, level: 1, text: "Alpha", occurrence: 1 },
    ],
  );
  assert.deepEqual(buildHeadingSignatures("junk", headings), []);
});

test("remapFoldEntry leaves valid entries alone", () => {
  const entry = {
    folds: [{ from: 2, to: 5 }],
    lines: 10,
    cubicjHeadings: [{ from: 2, level: 1, text: "Alpha", occurrence: 0 }],
  };
  assert.deepEqual(
    remapFoldEntry(entry, [{ line: 2, level: 1, text: "Alpha" }], 10),
    { action: "keep" },
  );
});

test("remapFoldEntry fails closed on legacy or malformed entries", () => {
  const headings = [{ line: 2, level: 1, text: "Alpha" }];
  assert.deepEqual(
    remapFoldEntry({ folds: [{ from: 2, to: 5 }], lines: 10 }, headings, 12),
    { action: "none" },
  );
  assert.deepEqual(
    remapFoldEntry(
      { folds: [{ from: 2, to: 5 }], lines: 10, cubicjHeadings: [] },
      headings,
      12,
    ),
    { action: "none" },
  );
  assert.deepEqual(
    remapFoldEntry(
      {
        folds: "junk",
        lines: 10,
        cubicjHeadings: [{ from: 2, level: 1, text: "Alpha", occurrence: 0 }],
      },
      headings,
      12,
    ),
    { action: "none" },
  );
  assert.deepEqual(
    remapFoldEntry(
      {
        folds: [{ from: 2, to: 5 }],
        lines: 10,
        cubicjHeadings: [{ from: 2, level: 1, text: "Alpha" }],
      },
      headings,
      12,
    ),
    { action: "none" },
  );
  assert.deepEqual(remapFoldEntry(null, headings, 12), { action: "none" });
  assert.deepEqual(remapFoldEntry([1, 2], headings, 12), { action: "none" });
});

test("remapFoldEntry remaps a moved heading fold and updates lines and signatures", () => {
  const entry = {
    folds: [{ from: 2, to: 5 }],
    lines: 10,
    cubicjHeadings: [{ from: 2, level: 1, text: "Alpha", occurrence: 0 }],
    extraneous: "kept",
  };
  assert.deepEqual(
    remapFoldEntry(entry, [{ line: 7, level: 1, text: "Alpha" }], 15),
    {
      action: "write",
      value: {
        folds: [{ from: 7, to: 7 }],
        lines: 15,
        cubicjHeadings: [{ from: 7, level: 1, text: "Alpha", occurrence: 0 }],
        extraneous: "kept",
      },
    },
  );
});

test("remapFoldEntry matches duplicate headings by occurrence order", () => {
  const entry = {
    folds: [
      { from: 2, to: 4 },
      { from: 9, to: 11 },
    ],
    lines: 20,
    cubicjHeadings: [
      { from: 2, level: 2, text: "Log", occurrence: 0 },
      { from: 9, level: 2, text: "Log", occurrence: 1 },
    ],
  };
  const headings = [
    { line: 5, level: 2, text: "Log" },
    { line: 14, level: 2, text: "Log" },
  ];
  assert.deepEqual(remapFoldEntry(entry, headings, 25), {
    action: "write",
    value: {
      folds: [
        { from: 5, to: 5 },
        { from: 14, to: 14 },
      ],
      lines: 25,
      cubicjHeadings: [
        { from: 5, level: 2, text: "Log", occurrence: 0 },
        { from: 14, level: 2, text: "Log", occurrence: 1 },
      ],
    },
  });
});

test("remapFoldEntry preserves a lone later duplicate occurrence", () => {
  const entry = {
    folds: [{ from: 9, to: 11 }],
    lines: 20,
    cubicjHeadings: [{ from: 9, level: 2, text: "Log", occurrence: 1 }],
  };
  const headings = [
    { line: 5, level: 2, text: "Log" },
    { line: 14, level: 2, text: "Log" },
  ];
  assert.deepEqual(remapFoldEntry(entry, headings, 25), {
    action: "write",
    value: {
      folds: [{ from: 14, to: 14 }],
      lines: 25,
      cubicjHeadings: [{ from: 14, level: 2, text: "Log", occurrence: 1 }],
    },
  });
});

test("remapFoldEntry drops a duplicate occurrence missing from current headings", () => {
  const entry = {
    folds: [{ from: 9, to: 11 }],
    lines: 20,
    cubicjHeadings: [{ from: 9, level: 2, text: "Log", occurrence: 1 }],
  };
  const headings = [{ line: 5, level: 2, text: "Log" }];
  assert.deepEqual(remapFoldEntry(entry, headings, 19), { action: "delete" });
});

test("remapFoldEntry preserves the properties marker and drops unmatched folds", () => {
  const entry = {
    folds: [
      { from: 0, to: 0 },
      { from: 3, to: 6 },
      { from: 10, to: 12 },
      { from: 15, to: 18 },
    ],
    lines: 30,
    cubicjHeadings: [
      { from: 3, level: 1, text: "Kept", occurrence: 0 },
      { from: 10, level: 1, text: "Renamed", occurrence: 0 },
    ],
  };
  const headings = [{ line: 4, level: 1, text: "Kept" }];
  assert.deepEqual(remapFoldEntry(entry, headings, 31), {
    action: "write",
    value: {
      folds: [
        { from: 0, to: 0 },
        { from: 4, to: 4 },
      ],
      lines: 31,
      cubicjHeadings: [{ from: 4, level: 1, text: "Kept", occurrence: 0 }],
    },
  });
});

test("remapFoldEntry deletes the entry when nothing survives", () => {
  const entry = {
    folds: [{ from: 3, to: 6 }],
    lines: 30,
    cubicjHeadings: [{ from: 3, level: 1, text: "Gone", occurrence: 0 }],
  };
  assert.deepEqual(remapFoldEntry(entry, [], 28), { action: "delete" });
});

test("remapFoldEntry does not map two signatures onto one heading", () => {
  const entry = {
    folds: [
      { from: 3, to: 6 },
      { from: 9, to: 12 },
    ],
    lines: 30,
    cubicjHeadings: [
      { from: 3, level: 1, text: "Solo", occurrence: 0 },
      { from: 9, level: 1, text: "Solo", occurrence: 1 },
    ],
  };
  const headings = [{ line: 5, level: 1, text: "Solo" }];
  assert.deepEqual(remapFoldEntry(entry, headings, 29), {
    action: "write",
    value: {
      folds: [{ from: 5, to: 5 }],
      lines: 29,
      cubicjHeadings: [{ from: 5, level: 1, text: "Solo", occurrence: 0 }],
    },
  });
});
