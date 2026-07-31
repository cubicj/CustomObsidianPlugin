export function countLines(text: string): number {
  return text.split("\n").length;
}

export function collectHeadingFoldLines(info: unknown, lineCount: number): Set<number> | null {
  if (typeof info !== "object" || info === null || Array.isArray(info)) {
    return null;
  }
  const candidate = info as { lines?: unknown; folds?: unknown };
  if (
    typeof candidate.lines !== "number" ||
    !Number.isFinite(candidate.lines) ||
    candidate.lines !== lineCount ||
    !Array.isArray(candidate.folds)
  ) {
    return null;
  }
  const lines = new Set<number>();
  for (const fold of candidate.folds) {
    if (typeof fold !== "object" || fold === null) {
      continue;
    }
    const from = (fold as { from?: unknown }).from;
    if (typeof from === "number" && Number.isFinite(from)) {
      lines.add(from);
    }
  }
  return lines;
}

export function isHeadingSectionHtml(html: unknown): boolean {
  return typeof html === "string" && /^<h[1-6][\s>]/.test(html);
}
