import test from "node:test";
import assert from "node:assert/strict";
import { isBlankLine, isHeadingLine, scanRegions } from "./note-format-utils.ts";

test("isHeadingLine accepts ATX headings with text", () => {
  assert.equal(isHeadingLine("# Title"), true);
  assert.equal(isHeadingLine("###### Deep"), true);
  assert.equal(isHeadingLine("#\tTabbed"), true);
});

test("isHeadingLine rejects tags, indented, quoted, empty and oversized hashes", () => {
  assert.equal(isHeadingLine("#tag"), false);
  assert.equal(isHeadingLine("  # Indented"), false);
  assert.equal(isHeadingLine("> # Quoted"), false);
  assert.equal(isHeadingLine("#"), false);
  assert.equal(isHeadingLine("# "), false);
  assert.equal(isHeadingLine("####### Seven"), false);
});

test("isBlankLine accepts empty and whitespace-only lines", () => {
  assert.equal(isBlankLine(""), true);
  assert.equal(isBlankLine("   "), true);
  assert.equal(isBlankLine("\t"), true);
  assert.equal(isBlankLine("\r"), true);
  assert.equal(isBlankLine(" x "), false);
});

test("scanRegions marks a closed frontmatter block", () => {
  const lines = ["---", "a: 1", "---", "# Title"];
  assert.deepEqual(scanRegions(lines), ["frontmatter", "frontmatter", "frontmatter", "normal"]);
});

test("scanRegions ignores an unterminated frontmatter opener", () => {
  const lines = ["---", "a: 1", "# Title"];
  assert.deepEqual(scanRegions(lines), ["normal", "normal", "normal"]);
});

test("scanRegions marks a backtick fence including its delimiters", () => {
  const lines = ["text", "```js", "# not a heading", "```", "after"];
  assert.deepEqual(scanRegions(lines), ["normal", "fence", "fence", "fence", "normal"]);
});

test("scanRegions marks a tilde fence", () => {
  const lines = ["~~~", "code", "~~~", "after"];
  assert.deepEqual(scanRegions(lines), ["fence", "fence", "fence", "normal"]);
});

test("scanRegions marks a list-indented fence", () => {
  const lines = ["- item", "  ```", "# not a heading", "  ```", "after"];
  assert.deepEqual(scanRegions(lines), ["normal", "fence", "fence", "fence", "normal"]);
});

test("scanRegions runs an unterminated fence to end of document", () => {
  const lines = ["text", "```", "# not a heading", "more"];
  assert.deepEqual(scanRegions(lines), ["normal", "fence", "fence", "fence"]);
});

test("scanRegions does not close a backtick fence with a tilde line", () => {
  const lines = ["```", "code", "~~~", "```", "after"];
  assert.deepEqual(scanRegions(lines), ["fence", "fence", "fence", "fence", "normal"]);
});

test("scanRegions requires the closing fence to be at least as long as the opener", () => {
  const lines = ["````", "```", "code", "````", "after"];
  assert.deepEqual(scanRegions(lines), ["fence", "fence", "fence", "fence", "normal"]);
});

test("scanRegions does not open a backtick fence whose info string has a backtick", () => {
  const lines = ["``` a ` b", "text"];
  assert.deepEqual(scanRegions(lines), ["normal", "normal"]);
});

test("scanRegions does not close a fence with trailing content on the delimiter", () => {
  const lines = ["```", "code", "``` tail", "```", "after"];
  assert.deepEqual(scanRegions(lines), ["fence", "fence", "fence", "fence", "normal"]);
});

test("scanRegions tolerates CRLF frontmatter delimiters", () => {
  const lines = ["---\r", "a: 1\r", "---\r", "# Title\r"];
  assert.deepEqual(scanRegions(lines), ["frontmatter", "frontmatter", "frontmatter", "normal"]);
});
