import test from "node:test";
import assert from "node:assert/strict";
import {
  createReadingListSourceLineResolver,
  getReadingListKind,
  hasReadingListBlankBefore,
  isReadingListMarkerLine,
  parseReadingListDataLine,
  resolveReadingListSourceLine,
} from "../src/modules/reading-list-blank-lines-utils.ts";

function sourceLines(source) {
  return source.split("\n");
}

function candidate(previousLine, currentLine, kind = "unordered") {
  return { previousLine, currentLine, kind };
}

test("reuses one source-line split and rejects a different renderer snapshot", () => {
  const resolveLines = createReadingListSourceLineResolver();
  const first = resolveLines("- a\n\n- b");

  assert.ok(first);
  assert.strictEqual(resolveLines("- a\n\n- b"), first);
  assert.equal(resolveLines("- x\n\n- y"), null);
});

test("does not mark adjacent unordered siblings without a blank line", () => {
  const lines = sourceLines("- a\n- b");
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 1)), false);
});

test("marks the top-level sibling that starts after a blank line", () => {
  const lines = sourceLines("- a\n\n- b");
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 2)), true);
});

test("marks only the top-level sibling after a nested list", () => {
  const lines = sourceLines("- a\n\t- a-1\n\t- a-2\n\n- b\n\t- b-1");
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 4)), true);
  assert.equal(hasReadingListBlankBefore(lines, candidate(1, 2)), false);
});

test("marks only the nested sibling after a blank line", () => {
  const lines = sourceLines("- a\n\t- a-1\n\n\t- a-2\n- b");
  assert.equal(hasReadingListBlankBefore(lines, candidate(1, 3)), true);
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 4)), false);
});

test("marks ordered siblings after a blank line", () => {
  const lines = sourceLines("1. a\n\n2. b");
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 2, "ordered")), true);
});

test("does not treat an internal continuation paragraph as a sibling boundary", () => {
  const lines = sourceLines("- a\n\n  continuation paragraph\n- b");
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 3)), false);
});

test("marks only one blank boundary among several siblings", () => {
  const lines = sourceLines("- a\n- b\n\n- c\n- d");
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 1)), false);
  assert.equal(hasReadingListBlankBefore(lines, candidate(1, 3)), true);
  assert.equal(hasReadingListBlankBefore(lines, candidate(3, 4)), false);
});

test("recognizes unordered and ordered source markers with indentation", () => {
  for (const line of ["- a", "+ a", "* a", "\t- nested", "  + nested"]) {
    assert.equal(isReadingListMarkerLine(line, "unordered"), true, line);
  }
  for (const line of ["1. a", "2) a", "\t10. nested", "  11) nested"]) {
    assert.equal(isReadingListMarkerLine(line, "ordered"), true, line);
  }
  for (const line of ["plain - text", "-not a list", "1.not a list", "```- fake```"]) {
    assert.equal(isReadingListMarkerLine(line, "unordered"), false, line);
    assert.equal(isReadingListMarkerLine(line, "ordered"), false, line);
  }
});

test("maps UL and OL tags to source marker kinds", () => {
  assert.equal(getReadingListKind("UL"), "unordered");
  assert.equal(getReadingListKind("ul"), "unordered");
  assert.equal(getReadingListKind("OL"), "ordered");
  assert.equal(getReadingListKind("ol"), "ordered");
  assert.equal(getReadingListKind("DIV"), null);
});

test("parses only non-negative integer data-line values", () => {
  assert.equal(parseReadingListDataLine("0"), 0);
  assert.equal(parseReadingListDataLine("12"), 12);
  for (const value of [null, "", "-1", "1.5", "NaN", "Infinity", " 1", "1 "]) {
    assert.equal(parseReadingListDataLine(value), null, String(value));
  }
});

test("resolves section-relative data-line values to absolute source lines", () => {
  assert.equal(resolveReadingListSourceLine(10, "0"), 10);
  assert.equal(resolveReadingListSourceLine(10, "4"), 14);
  assert.equal(resolveReadingListSourceLine(-1, "0"), null);
  assert.equal(resolveReadingListSourceLine(1.5, "0"), null);
  assert.equal(resolveReadingListSourceLine(Number.MAX_SAFE_INTEGER, "1"), null);
  assert.equal(resolveReadingListSourceLine(0, "invalid"), null);
});

test("accepts whitespace-only and repeated blank lines", () => {
  assert.equal(
    hasReadingListBlankBefore(sourceLines("- a\n \t\n- b"), candidate(0, 2)),
    true,
  );
  assert.equal(
    hasReadingListBlankBefore(sourceLines("- a\n\n\n- b"), candidate(0, 3)),
    true,
  );
});

test("rejects mismatched list kinds and invalid sibling coordinates", () => {
  const lines = sourceLines("- a\n\n- b\n\n1. c");
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 2, "ordered")), false);
  assert.equal(hasReadingListBlankBefore(lines, candidate(4, 2)), false);
  assert.equal(hasReadingListBlankBefore(lines, candidate(2, 2)), false);
  assert.equal(hasReadingListBlankBefore(lines, candidate(-1, 2)), false);
  assert.equal(hasReadingListBlankBefore(lines, candidate(0, 99)), false);
});

test("rejects invalid runtime list kinds", () => {
  const lines = sourceLines("1. a\n\n2. b");
  assert.equal(
    hasReadingListBlankBefore(lines, {
      kind: "invalid",
      previousLine: 0,
      currentLine: 2,
    }),
    false,
  );
});

test("requires both sibling coordinates to point at real list markers", () => {
  const paragraph = sourceLines("plain text\n\n- real");
  assert.equal(hasReadingListBlankBefore(paragraph, candidate(0, 2)), false);
});

test("returns the same decision on repeated planning", () => {
  const lines = sourceLines("- a\n\n- b");
  const input = candidate(0, 2);
  assert.equal(hasReadingListBlankBefore(lines, input), true);
  assert.equal(hasReadingListBlankBefore(lines, input), true);
});
