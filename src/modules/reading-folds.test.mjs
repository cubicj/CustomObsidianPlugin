import test from "node:test";
import assert from "node:assert/strict";
import {
  collectHeadingFoldLines,
  countLines,
  isHeadingSectionHtml,
} from "./reading-folds-utils.ts";

test("counts one line for empty text", () => {
  assert.equal(countLines(""), 1);
});

test("counts newline characters plus one", () => {
  assert.equal(countLines("first\nsecond\n"), 3);
  assert.equal(countLines("first\r\nsecond"), 2);
});

test("rejects missing and non-object fold info", () => {
  assert.equal(collectHeadingFoldLines(null, 3), null);
  assert.equal(collectHeadingFoldLines(undefined, 3), null);
  assert.equal(collectHeadingFoldLines("folds", 3), null);
  assert.equal(collectHeadingFoldLines([], 3), null);
});

test("rejects fold info with invalid lines or folds", () => {
  assert.equal(collectHeadingFoldLines({ lines: "3", folds: [] }, 3), null);
  assert.equal(collectHeadingFoldLines({ lines: 3, folds: null }, 3), null);
  assert.equal(collectHeadingFoldLines({ lines: 3, folds: {} }, 3), null);
});

test("rejects stale fold info", () => {
  assert.equal(collectHeadingFoldLines({ lines: 4, folds: [{ from: 1, to: 2 }] }, 3), null);
});

test("collects numeric heading fold start lines", () => {
  assert.deepEqual(
    collectHeadingFoldLines(
      {
        lines: 8,
        folds: [
          { from: 1, to: 3 },
          { from: 5, to: 7 },
          { from: 1, to: 4 },
        ],
      },
      8,
    ),
    new Set([1, 5]),
  );
});

test("skips folds without finite numeric start lines", () => {
  assert.deepEqual(
    collectHeadingFoldLines(
      {
        lines: 5,
        folds: [
          { from: "1", to: 2 },
          { from: null, to: 3 },
          { from: Number.NaN, to: 4 },
          { from: Number.POSITIVE_INFINITY, to: 5 },
          {},
        ],
      },
      5,
    ),
    new Set(),
  );
});

test("returns an empty set for valid fold info without folds", () => {
  assert.deepEqual(collectHeadingFoldLines({ lines: 1, folds: [] }, 1), new Set());
});

test("recognizes heading section html", () => {
  assert.equal(isHeadingSectionHtml("<h1>Title</h1>"), true);
  assert.equal(isHeadingSectionHtml('<h6 class="heading">Title</h6>'), true);
  assert.equal(isHeadingSectionHtml("<h3\tdata-heading=\"Title\">Title</h3>"), true);
});

test("rejects non-heading section html", () => {
  assert.equal(isHeadingSectionHtml(null), false);
  assert.equal(isHeadingSectionHtml(3), false);
  assert.equal(isHeadingSectionHtml(" <h1>Title</h1>"), false);
  assert.equal(isHeadingSectionHtml("<H1>Title</H1>"), false);
  assert.equal(isHeadingSectionHtml("<h7>Title</h7>"), false);
  assert.equal(isHeadingSectionHtml("<hr>"), false);
  assert.equal(isHeadingSectionHtml("<header>Title</header>"), false);
  assert.equal(isHeadingSectionHtml("<blockquote><h1>Title</h1></blockquote>"), false);
});
