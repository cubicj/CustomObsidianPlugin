import { describe, it, expect } from "vitest";
import { contentHash, estimateTokens, buildBatches, PendingDocument } from "../embedding/pipeline";

function makePending(path: string, tokens: number, chunkCount = 1): PendingDocument {
  return {
    path,
    hash: "h",
    chunks: Array.from({ length: chunkCount }, (_, i) => ({
      key: `${path}#chunk${i}`,
      heading: `chunk${i}`,
      content: "x",
    })),
    tokens,
  };
}

describe("contentHash", () => {
  it("returns same hash for same input", () => {
    expect(contentHash("hello")).toBe(contentHash("hello"));
  });

  it("returns different hash for different input", () => {
    expect(contentHash("hello")).not.toBe(contentHash("world"));
  });

  it("returns a string", () => {
    expect(typeof contentHash("test")).toBe("string");
  });
});

describe("estimateTokens", () => {
  it("returns ceil(length / 2)", () => {
    expect(estimateTokens("abcde")).toBe(3);
    expect(estimateTokens("abcd")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("buildBatches", () => {
  const MAX_BATCH_TOKENS = 120_000;

  it("returns empty array for empty input", () => {
    expect(buildBatches([], MAX_BATCH_TOKENS)).toEqual([]);
  });

  it("groups all items in one batch when under limits", () => {
    const pending = [makePending("a.md", 100), makePending("b.md", 200)];
    const batches = buildBatches(pending, MAX_BATCH_TOKENS);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("splits when exceeding 128 items", () => {
    const pending = Array.from({ length: 200 }, (_, i) => makePending(`f${i}.md`, 10));
    const batches = buildBatches(pending, MAX_BATCH_TOKENS);
    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches[0]).toHaveLength(128);
    expect(batches[1]).toHaveLength(72);
  });

  it("splits when exceeding 85% token budget", () => {
    const safeLimit = MAX_BATCH_TOKENS * 0.85;
    const tokensPer = Math.floor(safeLimit / 2);
    const pending = [
      makePending("a.md", tokensPer),
      makePending("b.md", tokensPer),
      makePending("c.md", tokensPer),
    ];
    const batches = buildBatches(pending, MAX_BATCH_TOKENS);
    expect(batches.length).toBeGreaterThanOrEqual(2);
  });

  it("splits when exceeding 16000 chunks", () => {
    const pending = [
      makePending("a.md", 100, 10000),
      makePending("b.md", 100, 10000),
    ];
    const batches = buildBatches(pending, MAX_BATCH_TOKENS);
    expect(batches).toHaveLength(2);
  });
});
