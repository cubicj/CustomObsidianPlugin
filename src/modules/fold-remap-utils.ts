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

export type FoldReapplyDecision = "apply" | "retry" | "exhausted";

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

function hasLineZeroHeadingSignature(signatures: unknown): boolean {
  return (
    Array.isArray(signatures) &&
    signatures.some(
      (signature) => isHeadingSignature(signature) && signature.from === 0,
    )
  );
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
    if (!isFoldRange(value)) {
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

function documentLineValidatesSignature(
  line: string | undefined,
  signature: HeadingSignature,
): boolean {
  if (
    line === undefined ||
    !Number.isInteger(signature.level) ||
    signature.level < 1
  ) {
    return false;
  }
  const marker = "#".repeat(signature.level);
  return line.startsWith(marker) && /^[ \t]+\S/.test(line.slice(marker.length));
}

export function enrichSignatures(
  folds: unknown,
  headings: CurrentHeading[],
  documentLines: string[] | null,
  priorSignatures: unknown,
): HeadingSignature[] {
  if (!Array.isArray(folds)) {
    return [];
  }
  const cacheByFrom = new Map<number, HeadingSignature>();
  for (const signature of buildHeadingSignatures(folds, headings)) {
    if (!cacheByFrom.has(signature.from)) {
      cacheByFrom.set(signature.from, signature);
    }
  }
  const priorByFrom = new Map<number, HeadingSignature>();
  if (Array.isArray(priorSignatures)) {
    for (const value of priorSignatures) {
      if (isHeadingSignature(value) && !priorByFrom.has(value.from)) {
        priorByFrom.set(value.from, value);
      }
    }
  }
  const signatures: HeadingSignature[] = [];
  for (const value of folds) {
    if (!isFoldRange(value)) {
      continue;
    }
    const cached = cacheByFrom.get(value.from);
    if (
      cached &&
      (documentLines === null ||
        documentLineValidatesSignature(documentLines[value.from], cached))
    ) {
      signatures.push(cached);
      continue;
    }
    const prior = priorByFrom.get(value.from);
    if (prior) {
      signatures.push(prior);
    }
  }
  return signatures;
}

export function hasPropertiesFoldMarker(
  folds: unknown,
  signatures: unknown,
): boolean {
  if (!Array.isArray(folds)) {
    return false;
  }
  return (
    !hasLineZeroHeadingSignature(signatures) &&
    folds.some((fold) => isFoldRange(fold) && isPropertiesMarker(fold))
  );
}

export function shouldReapplyFoldEntry(
  liveInfo: unknown,
  entry: Record<string, unknown>,
): boolean {
  if (typeof liveInfo !== "object" || liveInfo === null) {
    return true;
  }
  const live = liveInfo as { folds?: unknown; lines?: unknown };
  if (
    !Array.isArray(live.folds) ||
    typeof live.lines !== "number" ||
    !Number.isFinite(live.lines) ||
    !Array.isArray(entry.folds) ||
    typeof entry.lines !== "number" ||
    !Number.isFinite(entry.lines)
  ) {
    return true;
  }
  if (entry.lines !== live.lines) {
    return false;
  }
  const liveStarts = new Set<number>();
  for (const fold of live.folds) {
    if (isFoldRange(fold)) {
      liveStarts.add(fold.from);
    }
  }
  const lineZeroIsHeading = hasLineZeroHeadingSignature(entry.cubicjHeadings);
  for (const fold of entry.folds) {
    if (!isFoldRange(fold)) {
      continue;
    }
    if (isPropertiesMarker(fold) && !lineZeroIsHeading) {
      continue;
    }
    if (!liveStarts.has(fold.from)) {
      return true;
    }
  }
  return false;
}

export function decideFoldReapply(
  viewData: string,
  targetData: string,
  attempt: number,
  maxAttempts: number,
): FoldReapplyDecision {
  if (viewData === targetData) {
    return "apply";
  }
  return attempt >= maxAttempts ? "exhausted" : "retry";
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
  if (
    record.lines === lineCount &&
    signatures.every(
      (signature) =>
        availableLines.get(headingKey(signature.level, signature.text))?.[
          signature.occurrence
        ] === signature.from,
    )
  ) {
    return { action: "keep" };
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
  let hasPropertiesMarker = false;
  for (const fold of folds) {
    const signature = signatureByFrom.get(fold.from);
    if (isPropertiesMarker(fold) && !signature) {
      hasPropertiesMarker = true;
      continue;
    }
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
  if (hasPropertiesMarker && !usedLines.has(0)) {
    newFolds.unshift({ from: 0, to: 0 });
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
