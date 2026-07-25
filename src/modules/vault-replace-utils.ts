export interface MatcherOptions {
  caseSensitive: boolean;
  useRegex: boolean;
}

export type MatcherResult = { ok: true; regex: RegExp } | { ok: false; error: string };

export interface Match {
  start: number;
  end: number;
  line: number;
  column: number;
  lineText: string;
}

export interface PreviewSegments {
  before: string;
  match: string;
  after: string;
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
