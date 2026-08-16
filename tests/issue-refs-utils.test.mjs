import test from "node:test";
import assert from "node:assert/strict";
import {
  findIssueReferences,
  isIssueReferenceExcludedReadingElement,
  isIssueReferenceExcludedSyntaxNode,
  isIssueReferenceTagCharacter,
} from "../src/modules/issue-refs-utils.ts";

test("finds standalone references at line start and after whitespace", () => {
  assert.deepEqual(findIssueReferences("#123 and #45"), [
    { kind: "standalone", from: 0, to: 4 },
    { kind: "standalone", from: 9, to: 12 },
  ]);
  assert.deepEqual(findIssueReferences("before\n#7"), [
    { kind: "standalone", from: 7, to: 9 },
  ]);
});

test("keeps punctuation terminators outside standalone references", () => {
  assert.deepEqual(findIssueReferences("#111, #42."), [
    { kind: "standalone", from: 0, to: 4 },
    { kind: "standalone", from: 6, to: 9 },
  ]);
});

test("classifies Korean particles as digit-led tag tails", () => {
  assert.deepEqual(findIssueReferences("#123을 확인"), [
    { kind: "digit-led-tag", from: 0, to: 4, tailFrom: 4, tailTo: 5 },
  ]);
});

test("collects the full valid tail of a digit-led tag", () => {
  assert.deepEqual(findIssueReferences(" #12abc_가-4/child,"), [
    { kind: "digit-led-tag", from: 1, to: 4, tailFrom: 4, tailTo: 17 },
  ]);
});

test("leaves non-numeric tags untouched", () => {
  assert.deepEqual(findIssueReferences("#abc #a123"), []);
});

test("rejects hashes outside the line-start-or-whitespace boundary", () => {
  assert.deepEqual(findIssueReferences("word#123 (#42) [#7] ##8 /#9"), []);
});

test("does not treat a Markdown link destination as a reference", () => {
  assert.deepEqual(findIssueReferences("[link](#123)"), []);
});

test("recognizes Obsidian tag characters", () => {
  for (const character of ["a", "가", "_", "-", "/", "4", "😀"]) {
    assert.equal(isIssueReferenceTagCharacter(character), true, character);
  }
});

test("recognizes whitespace and punctuation tag terminators", () => {
  for (const character of [" ", "\n", ",", ".", "#", "[", "]", "—", "⸺"]) {
    assert.equal(isIssueReferenceTagCharacter(character), false, character);
  }
});

test("returns references in source order without consuming terminators", () => {
  assert.deepEqual(findIssueReferences("x\t#1; y\n#22을 z #333"), [
    { kind: "standalone", from: 2, to: 4 },
    { kind: "digit-led-tag", from: 8, to: 11, tailFrom: 11, tailTo: 12 },
    { kind: "standalone", from: 15, to: 19 },
  ]);
});

test("recognizes live-preview syntax contexts that suppress rendering", () => {
  for (const name of [
    "inline-code",
    "variable_hmd-codeblock",
    "line-HyperMD-codeblock",
    "math",
    "hmd-frontmatter",
    "comment",
    "string_url",
    "formatting-link-string",
  ]) {
    assert.equal(isIssueReferenceExcludedSyntaxNode(name), true, name);
  }
  for (const name of ["Document", "hashtag_meta", "strong"]) {
    assert.equal(isIssueReferenceExcludedSyntaxNode(name), false, name);
  }
});

test("recognizes reading-view exclusions and the idempotency marker", () => {
  for (const tagName of ["CODE", "PRE", "code", "pre"]) {
    assert.equal(isIssueReferenceExcludedReadingElement(tagName, []), true, tagName);
  }
  for (const className of [
    "math",
    "frontmatter",
    "metadata-container",
    "metadata-properties",
    "cubicj-issue-ref",
  ]) {
    assert.equal(
      isIssueReferenceExcludedReadingElement("SPAN", [className]),
      true,
      className,
    );
  }
  assert.equal(isIssueReferenceExcludedReadingElement("A", ["tag"]), false);
  assert.equal(isIssueReferenceExcludedReadingElement("SPAN", []), false);
});
