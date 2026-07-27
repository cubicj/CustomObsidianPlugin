export type LineRegion = "frontmatter" | "fence" | "normal";

const HEADING_PATTERN = /^#{1,6}[ \t]+\S/;
const BLANK_PATTERN = /^[ \t\r]*$/;
const FRONTMATTER_DELIMITER_PATTERN = /^---[ \t\r]*$/;
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
      if (!FRONTMATTER_DELIMITER_PATTERN.test(lines[index])) continue;
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
