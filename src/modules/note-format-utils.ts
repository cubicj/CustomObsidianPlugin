export type LineRegion = "frontmatter" | "fence" | "normal";

const HEADING_PATTERN = /^#{1,6}[ \t]+\S/;
const BLANK_PATTERN = /^[ \t\r]*$/;
const LIST_ITEM_PATTERN = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/;
const FRONTMATTER_DELIMITER_PATTERN = /^---[ \t\r]*$/;
const FRONTMATTER_CLOSING_DELIMITER_PATTERN = /^(?:---|\.\.\.)[ \t\r]*$/;
const FENCE_PATTERN = /^[ \t]*(`{3,}|~{3,})(.*)$/;

export function isHeadingLine(line: string): boolean {
  return HEADING_PATTERN.test(line);
}

export function isBlankLine(line: string): boolean {
  return BLANK_PATTERN.test(line);
}

export function scanRegions(lines: string[]): LineRegion[] {
  const regions: LineRegion[] = lines.map(() => "normal");
  let bodyStart = 0;
  if (lines.length > 0 && FRONTMATTER_DELIMITER_PATTERN.test(lines[0])) {
    for (let index = 1; index < lines.length; index++) {
      if (!FRONTMATTER_CLOSING_DELIMITER_PATTERN.test(lines[index])) continue;
      for (let inner = 0; inner <= index; inner++) {
        regions[inner] = "frontmatter";
      }
      bodyStart = index + 1;
      break;
    }
  }
  let openMarker: string | null = null;
  for (let index = bodyStart; index < lines.length; index++) {
    const match = FENCE_PATTERN.exec(lines[index]);
    if (openMarker === null) {
      if (!match) continue;
      if (match[1].startsWith("`") && match[2].includes("`")) continue;
      openMarker = match[1];
      regions[index] = "fence";
      continue;
    }
    regions[index] = "fence";
    const closes =
      match !== null &&
      match[1][0] === openMarker[0] &&
      match[1].length >= openMarker.length &&
      isBlankLine(match[2]);
    if (closes) openMarker = null;
  }
  return regions;
}

export function isNormalRegionLine(lines: string[], lineIndex: number): boolean {
  return scanRegions(lines)[lineIndex] === "normal";
}

export interface NoteFormatSettings {
  normalizeTrailingNewline: boolean;
  blankLinesAroundHeadings: boolean;
  collapseBlankLines: boolean;
  blankLineAfterList: boolean;
  headingEnterBlankLine: boolean;
}

export const DEFAULT_NOTE_FORMAT_SETTINGS: NoteFormatSettings = {
  normalizeTrailingNewline: true,
  blankLinesAroundHeadings: true,
  collapseBlankLines: true,
  blankLineAfterList: true,
  headingEnterBlankLine: true,
};

export function formatNoteContent(content: string, settings: NoteFormatSettings): string | null {
  if (content.length === 0) return null;
  const lineEnding = content.match(/\r\n|\n/)?.[0] ?? "\n";
  const insertedBlankLine = lineEnding === "\r\n" ? "\r" : "";
  let lines = content.split("\n");
  if (settings.collapseBlankLines) lines = collapseBlankRuns(lines);
  if (settings.blankLineAfterList) lines = padTextAfterLists(lines, insertedBlankLine);
  if (settings.blankLinesAroundHeadings) lines = padHeadings(lines, insertedBlankLine);
  let next = lines.join("\n");
  if (settings.normalizeTrailingNewline) {
    next = `${next.replace(/(?:(?:\r\n|\n)[ \t]*)+$/, "")}${lineEnding}`;
  }
  return next === content ? null : next;
}

function collapseBlankRuns(lines: string[]): string[] {
  const regions = scanRegions(lines);
  const output: string[] = [];
  let run = 0;
  for (let index = 0; index < lines.length; index++) {
    const collapsible = regions[index] === "normal" && isBlankLine(lines[index]);
    if (!collapsible) {
      run = 0;
      output.push(lines[index]);
      continue;
    }
    run++;
    if (run === 1) output.push(lines[index]);
  }
  return output;
}

function padTextAfterLists(lines: string[], insertedBlankLine: string): string[] {
  const regions = scanRegions(lines);
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    output.push(line);
    if (index + 1 >= lines.length) continue;
    const nextLine = lines[index + 1];
    if (
      regions[index] === "normal" &&
      regions[index + 1] === "normal" &&
      LIST_ITEM_PATTERN.test(line) &&
      !isBlankLine(nextLine) &&
      /^\S/.test(nextLine) &&
      !LIST_ITEM_PATTERN.test(nextLine) &&
      !isHeadingLine(nextLine) &&
      !nextLine.startsWith(">") &&
      !nextLine.startsWith("|")
    ) {
      output.push(insertedBlankLine);
    }
  }
  return output;
}

function padHeadings(lines: string[], insertedBlankLine: string): string[] {
  const regions = scanRegions(lines);
  const bodyStart = findBodyStart(regions);
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (regions[index] !== "normal" || !isHeadingLine(line)) {
      output.push(line);
      continue;
    }
    if (index > bodyStart && output.length > 0 && !isBlankLine(output[output.length - 1])) {
      output.push(insertedBlankLine);
    }
    output.push(line);
    if (index + 1 < lines.length && !isBlankLine(lines[index + 1])) {
      output.push(insertedBlankLine);
    }
  }
  return output;
}

function findBodyStart(regions: LineRegion[]): number {
  let index = 0;
  while (index < regions.length && regions[index] === "frontmatter") index++;
  return index;
}
