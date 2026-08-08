import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTE_FORMAT_SETTINGS,
  formatNoteContent,
  isBlankLine,
  isHeadingLine,
  isNormalRegionLine,
  scanRegions,
} from "./note-format-utils.ts";

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

test("classifies a heading-shaped line inside closed frontmatter against the whole document", () => {
  assert.equal(isNormalRegionLine(["---", "# comment", "key: value", "---", "body"], 1), false);
  assert.equal(isNormalRegionLine(["---", "# comment", "key: value", "...", "body"], 1), false);
});

test("classifies a heading-shaped line after an unterminated frontmatter candidate as normal", () => {
  assert.equal(isNormalRegionLine(["---", "# comment", "key: value"], 1), true);
});

const ALL_ON = DEFAULT_NOTE_FORMAT_SETTINGS;
const ONLY_HEADINGS = {
  normalizeTrailingNewline: false,
  blankLinesAroundHeadings: true,
  collapseBlankLines: false,
  blankLineAfterList: false,
  headingEnterBlankLine: false,
};
const ONLY_COLLAPSE = {
  normalizeTrailingNewline: false,
  blankLinesAroundHeadings: false,
  collapseBlankLines: true,
  blankLineAfterList: false,
  headingEnterBlankLine: false,
};
const ONLY_LIST = {
  normalizeTrailingNewline: false,
  blankLinesAroundHeadings: false,
  collapseBlankLines: false,
  blankLineAfterList: true,
  headingEnterBlankLine: false,
};
const ONLY_TRAILING = {
  normalizeTrailingNewline: true,
  blankLinesAroundHeadings: false,
  collapseBlankLines: false,
  blankLineAfterList: false,
  headingEnterBlankLine: false,
};
const ALL_OFF = {
  normalizeTrailingNewline: false,
  blankLinesAroundHeadings: false,
  collapseBlankLines: false,
  blankLineAfterList: false,
  headingEnterBlankLine: false,
};

test("defaults enable every rule", () => {
  assert.deepEqual(DEFAULT_NOTE_FORMAT_SETTINGS, {
    normalizeTrailingNewline: true,
    blankLinesAroundHeadings: true,
    collapseBlankLines: true,
    blankLineAfterList: true,
    headingEnterBlankLine: true,
  });
});

test("formatNoteContent returns null for empty content", () => {
  assert.equal(formatNoteContent("", ALL_ON), null);
});

test("formatNoteContent returns null when every rule is off", () => {
  assert.equal(formatNoteContent("# A\ntext", ALL_OFF), null);
});

test("list padding works standalone for a bullet followed by flush-left bold text", () => {
  assert.equal(formatNoteContent("- item\n**Label**\n", ONLY_LIST), "- item\n\n**Label**\n");
});

test("pads text after both ordered list marker styles", () => {
  assert.equal(formatNoteContent("1. item\ntext\n", ONLY_LIST), "1. item\n\ntext\n");
  assert.equal(formatNoteContent("1) item\ntext\n", ONLY_LIST), "1) item\n\ntext\n");
});

test("pads text after a task item", () => {
  assert.equal(formatNoteContent("- [ ] foo\ntext\n", ONLY_LIST), "- [ ] foo\n\ntext\n");
});

test("pads text after list items indented with spaces or a tab", () => {
  assert.equal(formatNoteContent("  - item\ntext\n", ONLY_LIST), "  - item\n\ntext\n");
  assert.equal(formatNoteContent("\t- item\ntext\n", ONLY_LIST), "\t- item\n\ntext\n");
});

test("does not pad continuation content with leading whitespace", () => {
  assert.equal(formatNoteContent("- item\n text\n", ONLY_LIST), null);
  assert.equal(formatNoteContent("- item\n\ttext\n", ONLY_LIST), null);
});

test("does not pad structural lines after a list item", () => {
  for (const next of ["- next", "1. next", "# Heading", "> quote", "| cell |", "```"]) {
    assert.equal(formatNoteContent(`- item\n${next}\n`, ONLY_LIST), null);
  }
});

test("does not pad list-shaped lines inside a fenced code block", () => {
  const input = "```md\n- item\ntext\n```\n";
  assert.equal(formatNoteContent(input, ONLY_LIST), null);
});

test("does not pad list-shaped lines inside frontmatter", () => {
  const input = "---\n- item\ntext\n---\nbody\n";
  assert.equal(formatNoteContent(input, ONLY_LIST), null);
});

test("keeps one existing blank after a list item and is idempotent", () => {
  const expected = "- item\n\ntext\n";
  assert.equal(formatNoteContent(expected, ONLY_LIST), null);
  const formatted = formatNoteContent("- item\ntext\n", ONLY_LIST);
  assert.equal(formatted, expected);
  assert.equal(formatNoteContent(formatted, ONLY_LIST), null);
});

test("leaves list-adjacent text unchanged when list padding is off", () => {
  assert.equal(formatNoteContent("- item\ntext\n", ALL_OFF), null);
});

test("wraps a heading that has text above and below", () => {
  assert.equal(formatNoteContent("intro\n# Title\nbody\n", ONLY_HEADINGS), "intro\n\n# Title\n\nbody\n");
});

test("does not add a blank line before a heading on the first body line", () => {
  assert.equal(formatNoteContent("# Title\nbody\n", ONLY_HEADINGS), "# Title\n\nbody\n");
});

test("does not add a blank line before a heading right after frontmatter", () => {
  const input = "---\na: 1\n---\n# Title\nbody\n";
  assert.equal(formatNoteContent(input, ONLY_HEADINGS), "---\na: 1\n---\n# Title\n\nbody\n");
});

test("keeps an existing blank line after frontmatter", () => {
  const input = "---\na: 1\n---\n\n# Title\n\nbody\n";
  assert.equal(formatNoteContent(input, ONLY_HEADINGS), null);
});

test("does not double the blank line between adjacent headings", () => {
  assert.equal(formatNoteContent("# A\n## B\n", ONLY_HEADINGS), "# A\n\n## B\n");
});

test("does not pad a heading that ends the document", () => {
  assert.equal(formatNoteContent("body\n# Title\n", ONLY_HEADINGS), "body\n\n# Title\n");
});

test("does not pad a heading that ends the document without a final newline", () => {
  assert.equal(formatNoteContent("body\n# Title", ONLY_HEADINGS), "body\n\n# Title");
});

test("leaves headings inside a fence alone", () => {
  const input = "```md\n# Title\ntext\n```\n";
  assert.equal(formatNoteContent(input, ONLY_HEADINGS), null);
});

test("leaves heading-shaped comments inside frontmatter alone", () => {
  const input = "---\n# comment\na: 1\n---\nbody\n";
  assert.equal(formatNoteContent(input, ONLY_HEADINGS), null);
});

test("leaves tags, indented and quoted heading lookalikes alone", () => {
  const input = "#tag\n  # indented\n> # quoted\n";
  assert.equal(formatNoteContent(input, ONLY_HEADINGS), null);
});

test("collapses a run of blank lines to one", () => {
  assert.equal(formatNoteContent("a\n\n\n\nb\n", ONLY_COLLAPSE), "a\n\nb\n");
});

test("leaves a single blank line alone", () => {
  assert.equal(formatNoteContent("a\n\nb\n", ONLY_COLLAPSE), null);
});

test("keeps the first line of a blank run verbatim", () => {
  assert.equal(formatNoteContent("a\n   \n\nb\n", ONLY_COLLAPSE), "a\n   \nb\n");
});

test("does not collapse blank lines inside a fence", () => {
  const input = "```\ncode\n\n\n\nmore\n```\n";
  assert.equal(formatNoteContent(input, ONLY_COLLAPSE), null);
});

test("appends a missing final newline", () => {
  assert.equal(formatNoteContent("text", ONLY_TRAILING), "text\n");
});

test("returns null when exactly one final newline is present", () => {
  assert.equal(formatNoteContent("text\n", ONLY_TRAILING), null);
});

test("collapses multiple final newlines to one", () => {
  assert.equal(formatNoteContent("text\n\n\n", ONLY_TRAILING), "text\n");
});

test("strips a whitespace-only trailing tail", () => {
  assert.equal(formatNoteContent("text\n  \n", ONLY_TRAILING), "text\n");
});

test("preserves trailing whitespace on the last content line", () => {
  assert.equal(formatNoteContent("- [ ] \n", ONLY_TRAILING), null);
});

test("applies every rule together in order", () => {
  const input = "---\na: 1\n---\n# Title\n- item\nbody\n\n\n\n## Next\ntail\n\n\n";
  const expected = "---\na: 1\n---\n# Title\n\n- item\n\nbody\n\n## Next\n\ntail\n";
  assert.equal(formatNoteContent(input, ALL_ON), expected);
});

test("returns null for content that is already fully formatted", () => {
  const input = "---\na: 1\n---\n# Title\n\n- item\n\nbody\n\n## Next\n\ntail\n";
  assert.equal(formatNoteContent(input, ALL_ON), null);
});

test("uses CRLF for blank lines inserted around headings", () => {
  const input = "intro\r\n# Title\r\nbody\r\n";
  const expected = "intro\r\n\r\n# Title\r\n\r\nbody\r\n";
  assert.equal(formatNoteContent(input, ONLY_HEADINGS), expected);
  assert.equal(formatNoteContent(expected, ONLY_HEADINGS), null);
});

test("uses CRLF for blank lines inserted after list items", () => {
  const input = "- item\r\ntext\r\n";
  const expected = "- item\r\n\r\ntext\r\n";
  assert.equal(formatNoteContent(input, ONLY_LIST), expected);
  assert.equal(formatNoteContent(expected, ONLY_LIST), null);
});

test("preserves CRLF while collapsing blank lines", () => {
  const input = "a\r\n\r\n\r\nb\r\n";
  const expected = "a\r\n\r\nb\r\n";
  assert.equal(formatNoteContent(input, ONLY_COLLAPSE), expected);
  assert.equal(formatNoteContent(expected, ONLY_COLLAPSE), null);
});

test("uses CRLF when normalizing the trailing newline", () => {
  assert.equal(formatNoteContent("first\r\nlast", ONLY_TRAILING), "first\r\nlast\r\n");
  assert.equal(formatNoteContent("text\r\n\r\n", ONLY_TRAILING), "text\r\n");
  assert.equal(formatNoteContent("text\r\n", ONLY_TRAILING), null);
});
