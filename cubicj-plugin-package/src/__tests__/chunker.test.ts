import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "../embedding/chunker";

describe("chunkMarkdown", () => {
  it("returns single chunk for plain text without headings", () => {
    const result = chunkMarkdown("note.md", "Hello world");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      key: "note.md",
      heading: "",
      content: "Hello world",
    });
  });

  it("splits on markdown headings", () => {
    const long = "x".repeat(60);
    const text = `${long}\n# First\n${long}\n## Second\n${long}`;
    const result = chunkMarkdown("note.md", text);
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe("note.md");
    expect(result[0].heading).toBe("");
    expect(result[1].key).toBe("note.md#First");
    expect(result[1].heading).toBe("First");
    expect(result[2].key).toBe("note.md#Second");
    expect(result[2].heading).toBe("Second");
  });

  it("returns file-path chunk for empty input", () => {
    const result = chunkMarkdown("empty.md", "");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("empty.md");
  });

  it("splits large chunks by paragraph", () => {
    const para = "x".repeat(800);
    const text = `# Big\n${para}\n\n${para}\n\n${para}`;
    const result = chunkMarkdown("big.md", text);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((c) => expect(c.content.length).toBeLessThanOrEqual(2100));
  });

  it("merges tiny chunks below MIN_CHUNK_CHARS", () => {
    const text = "# A\nhi\n# B\nworld of content that is longer than minimum";
    const result = chunkMarkdown("tiny.md", text);
    const firstContent = result[0].content;
    expect(firstContent).toContain("hi");
  });

  it("handles h1 through h6", () => {
    const long = "x".repeat(60);
    const text = `# H1\n${long}\n## H2\n${long}\n### H3\n${long}\n#### H4\n${long}\n##### H5\n${long}\n###### H6\n${long}`;
    const result = chunkMarkdown("levels.md", text);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const headings = result.map((c) => c.heading);
    expect(headings).toContain("H1");
    expect(headings).toContain("H6");
  });
});
