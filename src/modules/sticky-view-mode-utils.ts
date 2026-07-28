export interface StickySnapshot {
  mode: string;
  source: boolean;
}

export type StickyDecision =
  | { action: "pass" }
  | { action: "record"; snapshot: StickySnapshot }
  | { action: "coerce"; snapshot: StickySnapshot };

export function decideStickyViewMode(
  viewState: unknown,
  sticky: StickySnapshot | null,
  enabled: boolean,
): StickyDecision {
  if (typeof viewState !== "object" || viewState === null) {
    return { action: "pass" };
  }
  const record = viewState as { type?: unknown; state?: unknown; popstate?: unknown };
  if (record.type !== "markdown") {
    return { action: "pass" };
  }
  if (typeof record.state !== "object" || record.state === null) {
    return { action: "pass" };
  }
  const state = record.state as { mode?: unknown; source?: unknown };
  if (typeof state.mode !== "string") {
    return { action: "pass" };
  }
  if (record.popstate === true) {
    if (enabled && sticky) {
      return { action: "coerce", snapshot: { mode: sticky.mode, source: sticky.source } };
    }
    return { action: "pass" };
  }
  return {
    action: "record",
    snapshot: { mode: state.mode, source: state.source === true },
  };
}
