import test from "node:test";
import assert from "node:assert/strict";
import {
  isReadingBracketBoundaryTag,
  isReadingBracketExcludedElement,
  planReadingBracketDecorations,
} from "../src/modules/reading-brackets-utils.ts";

function decoratedParts(fragments) {
  return planReadingBracketDecorations(fragments).map((decoration) => ({
    ...decoration,
    text: fragments[decoration.fragmentIndex].slice(decoration.start, decoration.end),
  }));
}

test("plans weekday markers after two-digit and four-digit dates", () => {
  assert.deepEqual(decoratedParts(["26-08-05 [수]"]), [
    { markerIndex: 0, fragmentIndex: 0, start: 9, end: 10, kind: "glyph", text: "[" },
    { markerIndex: 0, fragmentIndex: 0, start: 10, end: 11, kind: "label", text: "수" },
    { markerIndex: 0, fragmentIndex: 0, start: 11, end: 12, kind: "glyph", text: "]" },
  ]);
  assert.deepEqual(
    decoratedParts(["2025-10-01 [수] → 2025-12-15 [월]"]).map(({ kind, text }) => ({ kind, text })),
    [
      { kind: "glyph", text: "[" },
      { kind: "label", text: "수" },
      { kind: "glyph", text: "]" },
      { kind: "glyph", text: "[" },
      { kind: "label", text: "월" },
      { kind: "glyph", text: "]" },
    ],
  );
});

test("plans every Korean weekday label", () => {
  assert.deepEqual(
    decoratedParts(["[월][화][수][목][금][토][일]"])
      .filter(({ kind }) => kind === "label")
      .map(({ text }) => text),
    ["월", "화", "수", "목", "금", "토", "일"],
  );
});

test("plans general, multiple, and adjacent markers", () => {
  assert.deepEqual(
    decoratedParts(["[주의] [확인 필요][1]"]).map(({ markerIndex, kind, text }) => ({
      markerIndex,
      kind,
      text,
    })),
    [
      { markerIndex: 0, kind: "glyph", text: "[" },
      { markerIndex: 0, kind: "label", text: "주의" },
      { markerIndex: 0, kind: "glyph", text: "]" },
      { markerIndex: 1, kind: "glyph", text: "[" },
      { markerIndex: 1, kind: "label", text: "확인 필요" },
      { markerIndex: 1, kind: "glyph", text: "]" },
      { markerIndex: 2, kind: "glyph", text: "[" },
      { markerIndex: 2, kind: "label", text: "1" },
      { markerIndex: 2, kind: "glyph", text: "]" },
    ],
  );
});

test("maps a marker across inline text fragments", () => {
  assert.deepEqual(decoratedParts(["[", "중", "요", "]"]), [
    { markerIndex: 0, fragmentIndex: 0, start: 0, end: 1, kind: "glyph", text: "[" },
    { markerIndex: 0, fragmentIndex: 1, start: 0, end: 1, kind: "label", text: "중" },
    { markerIndex: 0, fragmentIndex: 2, start: 0, end: 1, kind: "label", text: "요" },
    { markerIndex: 0, fragmentIndex: 3, start: 0, end: 1, kind: "glyph", text: "]" },
  ]);
});

test("keeps surrounding text out of the decoration plan", () => {
  assert.deepEqual(decoratedParts(["prefix [주의] suffix"]), [
    { markerIndex: 0, fragmentIndex: 0, start: 7, end: 8, kind: "glyph", text: "[" },
    { markerIndex: 0, fragmentIndex: 0, start: 8, end: 10, kind: "label", text: "주의" },
    { markerIndex: 0, fragmentIndex: 0, start: 10, end: 11, kind: "glyph", text: "]" },
  ]);
});

test("rejects empty, whitespace-only, nested, unmatched, and multiline markers", () => {
  assert.deepEqual(planReadingBracketDecorations(["[] [ ] [a[b]c] [unterminated [a\nb]"]), []);
  assert.deepEqual(planReadingBracketDecorations(["[a\nb]"]), []);
});

test("does not match across separate logical runs", () => {
  assert.deepEqual(planReadingBracketDecorations(["[주의"]), []);
  assert.deepEqual(planReadingBracketDecorations(["사항]"]), []);
});

test("recognizes every explicit block boundary tag", () => {
  const tags = [
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DETAILS", "DIV", "DL", "DT", "DD",
    "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "HEADER", "MAIN", "NAV",
    "SECTION", "SUMMARY", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "P", "LI",
    "OL", "UL", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "BR",
  ];
  for (const tag of tags) {
    assert.equal(isReadingBracketBoundaryTag(tag), true, tag);
    assert.equal(isReadingBracketBoundaryTag(tag.toLowerCase()), true, tag.toLowerCase());
  }
  for (const tag of ["SPAN", "STRONG", "EM", "MARK", "SMALL"]) {
    assert.equal(isReadingBracketBoundaryTag(tag), false, tag);
  }
});

test("recognizes excluded tags and classes", () => {
  for (const tag of ["PRE", "CODE", "A", "INPUT"]) {
    assert.equal(isReadingBracketExcludedElement(tag, []), true, tag);
    assert.equal(isReadingBracketExcludedElement(tag.toLowerCase(), []), true, tag.toLowerCase());
  }
  for (const className of [
    "metadata-container",
    "metadata-properties",
    "frontmatter",
    "cubicj-bracket-marker",
  ]) {
    assert.equal(isReadingBracketExcludedElement("DIV", [className]), true, className);
  }
  assert.equal(isReadingBracketExcludedElement("LI", ["task-list-item"]), false);
  assert.equal(isReadingBracketExcludedElement("SPAN", []), false);
});

test("returns operations ordered by fragment and source offset", () => {
  const decorations = planReadingBracketDecorations(["x[가]", "y[나]"]);
  for (let index = 1; index < decorations.length; index++) {
    const previous = decorations[index - 1];
    const current = decorations[index];
    assert.equal(
      previous.fragmentIndex < current.fragmentIndex ||
        (previous.fragmentIndex === current.fragmentIndex && previous.end <= current.start),
      true,
    );
  }
});
