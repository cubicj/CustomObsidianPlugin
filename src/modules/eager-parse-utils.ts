export function decideEagerParse(input: {
  enabled: boolean;
  composing: boolean;
  treeAvailable: boolean;
}): "skip" | "defer" | "force" {
  if (!input.enabled || input.treeAvailable) {
    return "skip";
  }
  if (input.composing) {
    return "defer";
  }
  return "force";
}

export function clampParseTarget(viewportTo: number, docLength: number): number {
  if (
    !Number.isFinite(viewportTo) ||
    viewportTo < 0 ||
    !Number.isFinite(docLength) ||
    docLength < 0
  ) {
    return 0;
  }
  return Math.min(viewportTo, docLength);
}
