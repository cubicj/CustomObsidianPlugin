export interface MatcherOptions {
  caseSensitive: boolean;
  useRegex: boolean;
}

export interface ScanInput extends MatcherOptions {
  query: string;
}

export interface ScanSnapshot extends ScanInput {
  regex: RegExp;
}

export type MatcherResult = { ok: true; regex: RegExp } | { ok: false; error: string };

export interface Match {
  start: number;
  end: number;
  line: number;
  column: number;
  lineText: string;
  additionalLines: number;
}

export interface PreviewSegments {
  before: string;
  match: string;
  after: string;
}

export interface MatchPreview extends PreviewSegments {
  additionalLines: number;
}

export interface ScannedFileMatches<T extends { path: string }> {
  file: T;
  matches: Match[];
}

export interface FileScanResult<T extends { path: string }> {
  results: ScannedFileMatches<T>[];
  failed: number;
}

const ELLIPSIS = "…";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMatcher(query: string, options: MatcherOptions): MatcherResult {
  const flags = options.caseSensitive ? "g" : "gi";
  const source = options.useRegex ? query : escapeRegExp(query);
  try {
    return { ok: true, regex: new RegExp(source, flags) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolveReplaceSnapshot(
  snapshot: ScanSnapshot | null,
  input: ScanInput,
): ScanSnapshot | null {
  if (
    snapshot === null ||
    snapshot.query.length === 0 ||
    snapshot.query !== input.query ||
    snapshot.caseSensitive !== input.caseSensitive ||
    snapshot.useRegex !== input.useRegex
  ) {
    return null;
  }
  return snapshot;
}

function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function findLineIndex(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

export function findMatches(content: string, regex: RegExp): Match[] {
  const matches: Match[] = [];
  const lineStarts = buildLineStarts(content);
  regex.lastIndex = 0;
  let match = regex.exec(content);
  while (match !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const line = findLineIndex(lineStarts, start);
    const lineStart = lineStarts[line];
    const nextLineStart = line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : content.length;
    const rawLine = content.slice(lineStart, nextLineStart);
    matches.push({
      start,
      end,
      line,
      column: start - lineStart,
      lineText: rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine,
      additionalLines: match[0].split("\n").length - 1,
    });
    if (match[0].length === 0) {
      regex.lastIndex = start + 1;
      if (regex.lastIndex > content.length) {
        break;
      }
    }
    match = regex.exec(content);
  }
  regex.lastIndex = 0;
  return matches;
}

export function buildPreviewLine(
  lineText: string,
  column: number,
  length: number,
  radius: number,
): PreviewSegments {
  const end = column + length;
  const from = Math.max(0, column - radius);
  const to = Math.min(lineText.length, end + radius);
  return {
    before: (from > 0 ? ELLIPSIS : "") + lineText.slice(from, column),
    match: lineText.slice(column, end),
    after: lineText.slice(end, to) + (to < lineText.length ? ELLIPSIS : ""),
  };
}

export function buildMatchPreview(match: Match, radius: number): MatchPreview {
  const firstLineLength = Math.min(
    match.end - match.start,
    Math.max(0, match.lineText.length - match.column),
  );
  return {
    ...buildPreviewLine(match.lineText, match.column, firstLineLength, radius),
    additionalLines: match.additionalLines,
  };
}

export async function scanMatchingFiles<T extends { path: string }>(
  files: readonly T[],
  regex: RegExp,
  read: (file: T) => Promise<string>,
  onFailure?: (file: T, error: unknown) => void,
): Promise<FileScanResult<T>> {
  const results: ScannedFileMatches<T>[] = [];
  let failed = 0;
  for (const file of files) {
    try {
      const matches = findMatches(await read(file), regex);
      if (matches.length > 0) {
        results.push({ file, matches });
      }
    } catch (error) {
      failed++;
      onFailure?.(file, error);
    }
  }
  results.sort((left, right) => left.file.path.localeCompare(right.file.path));
  return { results, failed };
}

export function applyReplace(
  content: string,
  regex: RegExp,
  replacement: string,
  useRegex: boolean,
): string {
  regex.lastIndex = 0;
  const value = useRegex ? replacement : replacement.replace(/\$/g, "$$$$");
  const result = content.replace(regex, value);
  regex.lastIndex = 0;
  return result;
}
