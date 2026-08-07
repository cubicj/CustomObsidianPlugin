export type ReadingBracketDecorationKind = "glyph" | "label";

export interface ReadingBracketDecoration {
  markerIndex: number;
  fragmentIndex: number;
  start: number;
  end: number;
  kind: ReadingBracketDecorationKind;
}

const BOUNDARY_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DETAILS", "DIV", "DL", "DT", "DD",
  "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "HEADER", "MAIN", "NAV",
  "SECTION", "SUMMARY", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "P", "LI",
  "OL", "UL", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "BR",
]);

const EXCLUDED_TAGS = new Set(["PRE", "CODE", "A", "INPUT"]);
const EXCLUDED_CLASSES = new Set([
  "metadata-container",
  "metadata-properties",
  "frontmatter",
  "cubicj-bracket-marker",
]);

export function isReadingBracketBoundaryTag(tagName: string): boolean {
  return BOUNDARY_TAGS.has(tagName.toUpperCase());
}

export function isReadingBracketExcludedElement(
  tagName: string,
  classNames: readonly string[],
): boolean {
  if (EXCLUDED_TAGS.has(tagName.toUpperCase())) {
    return true;
  }
  return classNames.some((className) => EXCLUDED_CLASSES.has(className));
}

export function planReadingBracketDecorations(
  fragments: readonly string[],
): ReadingBracketDecoration[] {
  const text = fragments.join("");
  const fragmentStarts: number[] = [];
  let total = 0;
  for (const fragment of fragments) {
    fragmentStarts.push(total);
    total += fragment.length;
  }

  const decorations: ReadingBracketDecoration[] = [];
  let depth = 0;
  let open = -1;
  let nested = false;
  let markerIndex = 0;

  const appendRegion = (
    regionStart: number,
    regionEnd: number,
    kind: ReadingBracketDecorationKind,
    currentMarkerIndex: number,
  ): void => {
    for (let fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex++) {
      const fragmentStart = fragmentStarts[fragmentIndex];
      const fragmentEnd = fragmentStart + fragments[fragmentIndex].length;
      const overlapStart = Math.max(regionStart, fragmentStart);
      const overlapEnd = Math.min(regionEnd, fragmentEnd);
      if (overlapStart >= overlapEnd) {
        continue;
      }
      decorations.push({
        markerIndex: currentMarkerIndex,
        fragmentIndex,
        start: overlapStart - fragmentStart,
        end: overlapEnd - fragmentStart,
        kind,
      });
    }
  };

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "\n" || character === "\r") {
      depth = 0;
      open = -1;
      nested = false;
      continue;
    }
    if (character === "[") {
      if (depth === 0) {
        open = index;
        nested = false;
      } else {
        nested = true;
      }
      depth++;
      continue;
    }
    if (character !== "]" || depth === 0) {
      continue;
    }
    depth--;
    if (depth !== 0) {
      continue;
    }
    const labelStart = open + 1;
    const labelEnd = index;
    const label = text.slice(labelStart, labelEnd);
    if (!nested && /\S/u.test(label)) {
      appendRegion(open, open + 1, "glyph", markerIndex);
      appendRegion(labelStart, labelEnd, "label", markerIndex);
      appendRegion(index, index + 1, "glyph", markerIndex);
      markerIndex++;
    }
    open = -1;
    nested = false;
  }

  decorations.sort(
    (left, right) =>
      left.fragmentIndex - right.fragmentIndex ||
      left.start - right.start ||
      left.end - right.end,
  );
  return decorations;
}
