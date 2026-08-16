import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveIssueReferencePrecedingCharacter,
  findIssueReferences,
  hasIssueReferenceBoundary,
  isIssueReferenceCodeBlockSyntaxNode,
  isIssueReferenceExcludedReadingElement,
  isIssueReferenceExcludedSyntaxNode,
  isIssueReferenceTagCharacter,
  shouldSuppressIssueReferenceClickableToken,
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

test("uses the effective DOM predecessor for reading-view boundaries", async (t) => {
  const createElement = (tagName, textContent, previousSibling, parentElement) => ({
    tagName,
    textContent,
    previousSibling,
    parentElement,
  });
  const createText = (textContent, previousSibling, parentElement) => ({
    textContent,
    previousSibling,
    parentElement,
  });
  const paragraph = createElement("P", null, null, null);
  const space = createText(" ", null, paragraph);
  const strongAfterSpace = createElement("STRONG", "#123", space, paragraph);
  const refAfterSpace = createText("#123", null, strongAfterSpace);
  const emphasis = createElement("EM", "em", null, paragraph);
  const refAfterInlineText = createText("#123", emphasis, paragraph);
  const strongAtStart = createElement("STRONG", "#123", null, paragraph);
  const refAtBlockStart = createText("#123", null, strongAtStart);
  const textBeforeBreak = createText("text", null, paragraph);
  const lineBreak = createElement("BR", "", textBeforeBreak, paragraph);
  const refAfterLineBreak = createText("#123", lineBreak, paragraph);
  const cases = [
    {
      name: "bold-wrapped ref after a space decorates",
      node: refAfterSpace,
      expected: [{ kind: "standalone", from: 0, to: 4 }],
    },
    {
      name: "ref immediately after inline text is skipped",
      node: refAfterInlineText,
      expected: [],
    },
    {
      name: "ref at block start decorates",
      node: refAtBlockStart,
      expected: [{ kind: "standalone", from: 0, to: 4 }],
    },
    {
      name: "ref after a soft line break decorates",
      node: refAfterLineBreak,
      expected: [{ kind: "standalone", from: 0, to: 4 }],
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const precedingCharacter = deriveIssueReferencePrecedingCharacter(
        fixture.node,
      );
      assert.equal(
        hasIssueReferenceBoundary(precedingCharacter),
        precedingCharacter === null || /\s/u.test(precedingCharacter),
      );
      assert.deepEqual(
        findIssueReferences("#123", precedingCharacter),
        fixture.expected,
      );
    });
  }
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
    "hmd-codeblock",
    "variable_hmd-codeblock",
    "plain_hmd-indented-code",
    "math",
    "hmd-frontmatter",
    "comment",
    "string_url",
    "formatting-link-string",
    "link",
    "hmd-internal-link",
  ]) {
    assert.equal(isIssueReferenceExcludedSyntaxNode(name), true, name);
  }
  for (const name of [
    "Document",
    "hashtag_meta",
    "strong",
    "line-HyperMD-codeblock",
  ]) {
    assert.equal(isIssueReferenceExcludedSyntaxNode(name), false, name);
  }
});

test("recognizes fenced and indented code-block syntax across a whole line", () => {
  for (const name of [
    "hmd-codeblock",
    "plain_hmd-codeblock",
    "hmd-indented-code",
    "plain_hmd-indented-code",
  ]) {
    assert.equal(isIssueReferenceCodeBlockSyntaxNode(name), true, name);
  }
  for (const name of ["inline-code", "line-HyperMD-codeblock", "plain"]) {
    assert.equal(isIssueReferenceCodeBlockSyntaxNode(name), false, name);
  }
});

test("recognizes reading-view exclusions and the idempotency marker", () => {
  for (const tagName of ["A", "CODE", "PRE", "a", "code", "pre"]) {
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
  assert.equal(isIssueReferenceExcludedReadingElement("SPAN", []), false);
});

test("suppresses clickable tokens only for digit-led tags", () => {
  for (const token of [
    { type: "tag", text: "#123" },
    { type: "tag", text: "#123을" },
  ]) {
    assert.equal(shouldSuppressIssueReferenceClickableToken(token), true);
  }
  for (const token of [
    null,
    { type: "tag", text: "#abc" },
    { type: "internal-link", text: "#123" },
    { type: "tag", text: 123 },
  ]) {
    assert.equal(shouldSuppressIssueReferenceClickableToken(token), false);
  }
});
