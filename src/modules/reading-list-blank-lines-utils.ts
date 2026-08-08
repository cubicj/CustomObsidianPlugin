export type ReadingListKind = "unordered" | "ordered";

export interface ReadingListBlankCandidate {
  kind: ReadingListKind;
  previousLine: number;
  currentLine: number;
}

const UNORDERED_LIST_PATTERN = /^[\t ]*[-+*](?:[\t ]+|$)/u;
const ORDERED_LIST_PATTERN = /^[\t ]*\d+[.)](?:[\t ]+|$)/u;
const DATA_LINE_PATTERN = /^(?:0|[1-9]\d*)$/u;
const BLANK_LINE_PATTERN = /^[\t ]*$/u;

export function createReadingListSourceLineResolver(): (
  text: string,
) => readonly string[] | null {
  let cachedText: string | null = null;
  let cachedLines: readonly string[] | null = null;
  return (text) => {
    if (cachedLines === null) {
      cachedText = text;
      cachedLines = text.split(/\r\n?|\n/u);
      return cachedLines;
    }
    return text === cachedText ? cachedLines : null;
  };
}

export function getReadingListKind(tagName: string): ReadingListKind | null {
  const normalized = tagName.toUpperCase();
  if (normalized === "UL") {
    return "unordered";
  }
  if (normalized === "OL") {
    return "ordered";
  }
  return null;
}

export function parseReadingListDataLine(value: string | null): number | null {
  if (value === null || !DATA_LINE_PATTERN.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function resolveReadingListSourceLine(
  lineStart: number,
  dataLine: string | null,
): number | null {
  if (!Number.isSafeInteger(lineStart) || lineStart < 0) {
    return null;
  }
  const relativeLine = parseReadingListDataLine(dataLine);
  if (relativeLine === null) {
    return null;
  }
  const sourceLine = lineStart + relativeLine;
  return Number.isSafeInteger(sourceLine) ? sourceLine : null;
}

export function isReadingListMarkerLine(line: string, kind: ReadingListKind): boolean {
  if (kind === "unordered") {
    return UNORDERED_LIST_PATTERN.test(line);
  }
  if (kind === "ordered") {
    return ORDERED_LIST_PATTERN.test(line);
  }
  return false;
}

export function hasReadingListBlankBefore(
  lines: readonly string[],
  candidate: ReadingListBlankCandidate,
): boolean {
  const { previousLine, currentLine, kind } = candidate;
  if (
    !Number.isSafeInteger(previousLine) ||
    !Number.isSafeInteger(currentLine) ||
    previousLine < 0 ||
    currentLine <= previousLine ||
    currentLine >= lines.length ||
    currentLine === 0
  ) {
    return false;
  }
  if (
    !isReadingListMarkerLine(lines[previousLine] ?? "", kind) ||
    !isReadingListMarkerLine(lines[currentLine] ?? "", kind)
  ) {
    return false;
  }
  return BLANK_LINE_PATTERN.test(lines[currentLine - 1] ?? "");
}
