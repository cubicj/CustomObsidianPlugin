import test from "node:test";
import assert from "node:assert/strict";
import {
  applyReplace,
  buildMatcher,
  buildPreviewLine,
  escapeRegExp,
  findMatches,
} from "./vault-replace-utils.ts";

function compile(query, options = {}) {
  const result = buildMatcher(query, {
    caseSensitive: options.caseSensitive ?? false,
    useRegex: options.useRegex ?? false,
  });
  assert.equal(result.ok, true);
  return result.regex;
}

test("escapeRegExp neutralizes regex metacharacters", () => {
  assert.equal(escapeRegExp("a.b*c"), "a\\.b\\*c");
  assert.equal(escapeRegExp("$1 (x) [y]"), "\\$1 \\(x\\) \\[y\\]");
});

test("literal mode treats the query as plain text", () => {
  const regex = compile("a.c");
  assert.equal(findMatches("abc a.c", regex).length, 1);
});

test("regex mode compiles the query as a pattern", () => {
  const regex = compile("a.c", { useRegex: true });
  assert.equal(findMatches("abc a.c", regex).length, 2);
});

test("matcher is case insensitive by default and case sensitive on request", () => {
  assert.equal(compile("abc").flags, "gi");
  assert.equal(compile("abc", { caseSensitive: true }).flags, "g");
});

test("matcher reports invalid regex instead of throwing", () => {
  const result = buildMatcher("(unclosed", { caseSensitive: false, useRegex: true });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.ok(result.error.length > 0);
});

test("findMatches reports offsets, line index, column and line text", () => {
  const content = "alpha\nbeta target gamma\ntarget\n";
  const matches = findMatches(content, compile("target"));
  assert.equal(matches.length, 2);
  assert.deepEqual(matches[0], {
    start: 11,
    end: 17,
    line: 1,
    column: 5,
    lineText: "beta target gamma",
  });
  assert.deepEqual(matches[1], {
    start: 24,
    end: 30,
    line: 2,
    column: 0,
    lineText: "target",
  });
});

test("findMatches strips a trailing carriage return from line text", () => {
  const matches = findMatches("one\r\ntwo hit\r\n", compile("hit"));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].lineText, "two hit");
  assert.equal(matches[0].column, 4);
});

test("findMatches terminates on a zero-length pattern", () => {
  const matches = findMatches("ab", compile("x*", { useRegex: true }));
  assert.equal(matches.length, 3);
});

test("findMatches resets a reused global regex", () => {
  const regex = compile("hit");
  assert.equal(findMatches("hit", regex).length, 1);
  assert.equal(findMatches("hit", regex).length, 1);
});

test("buildPreviewLine trims both sides with an ellipsis", () => {
  const lineText = `${"a".repeat(20)}target${"b".repeat(20)}`;
  assert.deepEqual(buildPreviewLine(lineText, 20, 6, 5), {
    before: "…aaaaa",
    match: "target",
    after: "bbbbb…",
  });
});

test("buildPreviewLine leaves short lines intact", () => {
  assert.deepEqual(buildPreviewLine("a target b", 2, 6, 40), {
    before: "a ",
    match: "target",
    after: " b",
  });
});

test("applyReplace inserts literal replacements verbatim", () => {
  const regex = compile("price");
  assert.equal(applyReplace("the price", regex, "$100", false), "the $100");
  assert.equal(applyReplace("the price", regex, "$& and $1", false), "the $& and $1");
});

test("applyReplace resolves capture groups in regex mode", () => {
  const regex = compile("(\\w+)@example\\.com", { useRegex: true });
  assert.equal(applyReplace("mail a@example.com", regex, "$1@test.com", true), "mail a@test.com");
});

test("applyReplace with an empty replacement deletes matches", () => {
  assert.equal(applyReplace("a-b-c", compile("-"), "", false), "abc");
});

test("applyReplace resets a reused global regex", () => {
  const regex = compile("x");
  assert.equal(applyReplace("x", regex, "y", false), "y");
  assert.equal(applyReplace("x", regex, "y", false), "y");
});
