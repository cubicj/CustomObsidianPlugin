export interface HeadingSignature {
  from: number;
  level: number;
  text: string;
  occurrence: number;
}

export interface CurrentHeading {
  line: number;
  level: number;
  text: string;
}

export type RemapOutcome =
  | { action: "none" }
  | { action: "keep" }
  | { action: "write"; value: Record<string, unknown> }
  | { action: "delete" };

interface FoldRangeLike {
  from: number;
  to: number;
}

interface HeadingCacheLike {
  heading?: unknown;
  level?: unknown;
  position?: { start?: { line?: unknown } };
}

export function collectCurrentHeadings(headings: unknown): CurrentHeading[] {
  if (!Array.isArray(headings)) {
    return [];
  }
  const result: CurrentHeading[] = [];
  for (const value of headings) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const heading = value as HeadingCacheLike;
    const line = heading.position?.start?.line;
    if (
      typeof heading.heading !== "string" ||
      typeof heading.level !== "number" ||
      !Number.isFinite(heading.level) ||
      typeof line !== "number" ||
      !Number.isFinite(line)
    ) {
      continue;
    }
    result.push({ line, level: heading.level, text: heading.heading });
  }
  return result;
}

function isFoldRange(value: unknown): value is FoldRangeLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fold = value as { from?: unknown; to?: unknown };
  return (
    typeof fold.from === "number" &&
    Number.isFinite(fold.from) &&
    typeof fold.to === "number" &&
    Number.isFinite(fold.to)
  );
}

function isPropertiesMarker(fold: FoldRangeLike): boolean {
  return fold.from === 0 && fold.to === 0;
}

export function buildHeadingSignatures(
  folds: unknown,
  headings: CurrentHeading[],
): HeadingSignature[] {
  if (!Array.isArray(folds)) {
    return [];
  }
  const byLine = new Map<number, HeadingSignature>();
  const occurrenceByKey = new Map<string, number>();
  for (const heading of headings) {
    const key = headingKey(heading.level, heading.text);
    const occurrence = occurrenceByKey.get(key) ?? 0;
    occurrenceByKey.set(key, occurrence + 1);
    if (!byLine.has(heading.line)) {
      byLine.set(heading.line, {
        from: heading.line,
        level: heading.level,
        text: heading.text,
        occurrence,
      });
    }
  }
  const signatures: HeadingSignature[] = [];
  for (const value of folds) {
    if (!isFoldRange(value) || isPropertiesMarker(value)) {
      continue;
    }
    const heading = byLine.get(value.from);
    if (!heading) {
      continue;
    }
    signatures.push({
      from: value.from,
      level: heading.level,
      text: heading.text,
      occurrence: heading.occurrence,
    });
  }
  return signatures;
}

function isHeadingSignature(value: unknown): value is HeadingSignature {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const signature = value as {
    from?: unknown;
    level?: unknown;
    text?: unknown;
    occurrence?: unknown;
  };
  return (
    typeof signature.from === "number" &&
    Number.isFinite(signature.from) &&
    typeof signature.level === "number" &&
    Number.isFinite(signature.level) &&
    typeof signature.text === "string" &&
    typeof signature.occurrence === "number" &&
    Number.isFinite(signature.occurrence)
  );
}

function headingKey(level: number, text: string): string {
  return level + "\u0000" + text;
}

export function remapFoldEntry(
  entry: unknown,
  headings: CurrentHeading[],
  lineCount: number,
): RemapOutcome {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return { action: "none" };
  }
  const record = entry as { folds?: unknown; lines?: unknown; cubicjHeadings?: unknown };
  if (
    typeof record.lines !== "number" ||
    !Number.isFinite(record.lines) ||
    !Array.isArray(record.folds) ||
    !record.folds.every(isFoldRange) ||
    !Array.isArray(record.cubicjHeadings) ||
    record.cubicjHeadings.length === 0 ||
    !record.cubicjHeadings.every(isHeadingSignature)
  ) {
    return { action: "none" };
  }
  if (record.lines === lineCount) {
    return { action: "keep" };
  }
  const folds = record.folds as FoldRangeLike[];
  const signatures = record.cubicjHeadings as HeadingSignature[];
  const availableLines = new Map<string, number[]>();
  for (const heading of headings) {
    const key = headingKey(heading.level, heading.text);
    const list = availableLines.get(key);
    if (list) {
      list.push(heading.line);
    } else {
      availableLines.set(key, [heading.line]);
    }
  }
  const signatureByFrom = new Map<number, HeadingSignature>();
  const matchedLineByFrom = new Map<number, number>();
  for (const signature of [...signatures].sort((a, b) => a.from - b.from)) {
    if (signatureByFrom.has(signature.from)) {
      continue;
    }
    signatureByFrom.set(signature.from, signature);
    const line =
      availableLines.get(headingKey(signature.level, signature.text))?.[
        signature.occurrence
      ];
    if (typeof line === "number") {
      matchedLineByFrom.set(signature.from, line);
    }
  }
  const newFolds: FoldRangeLike[] = [];
  const newSignatures: HeadingSignature[] = [];
  const usedLines = new Set<number>();
  for (const fold of folds) {
    if (isPropertiesMarker(fold)) {
      if (!usedLines.has(0)) {
        usedLines.add(0);
        newFolds.push({ from: 0, to: 0 });
      }
      continue;
    }
    const signature = signatureByFrom.get(fold.from);
    if (!signature) {
      continue;
    }
    const line = matchedLineByFrom.get(fold.from);
    if (typeof line !== "number" || usedLines.has(line)) {
      continue;
    }
    usedLines.add(line);
    newFolds.push({ from: line, to: line });
    newSignatures.push({
      from: line,
      level: signature.level,
      text: signature.text,
      occurrence: signature.occurrence,
    });
  }
  if (newFolds.length === 0) {
    return { action: "delete" };
  }
  return {
    action: "write",
    value: {
      ...(entry as Record<string, unknown>),
      folds: newFolds,
      lines: lineCount,
      cubicjHeadings: newSignatures,
    },
  };
}
