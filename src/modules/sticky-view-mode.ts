import { Plugin, WorkspaceLeaf } from "obsidian";
import { decideStickyViewMode } from "./sticky-view-mode-utils";
import type { StickySnapshot } from "./sticky-view-mode-utils";

export interface StickyViewModeSettings {
  enabled: boolean;
}

export const DEFAULT_STICKY_VIEW_MODE_SETTINGS: StickyViewModeSettings = {
  enabled: true,
};

type SetViewState = (this: WorkspaceLeaf, viewState: unknown, eState?: unknown) => Promise<void>;

interface LeafPrototypeLike {
  setViewState?: SetViewState;
}

export class StickyViewModeManager {
  private snapshots = new WeakMap<WorkspaceLeaf, StickySnapshot>();
  private originalSetViewState: SetViewState | null = null;
  private patchedSetViewState: SetViewState | null = null;

  constructor(
    private plugin: Plugin,
    private getSettings: () => StickyViewModeSettings,
  ) {}

  register(): void {
    const proto = WorkspaceLeaf.prototype as unknown as LeafPrototypeLike;
    if (typeof proto.setViewState !== "function") {
      return;
    }
    const original = proto.setViewState;
    this.originalSetViewState = original;
    const manager = this;
    const patchedSetViewState: SetViewState = function (
      viewState: unknown,
      eState?: unknown,
    ) {
      const decision = decideStickyViewMode(
        viewState,
        manager.snapshots.get(this) ?? null,
        manager.getSettings().enabled,
      );
      if (decision.action === "record") {
        manager.snapshots.set(this, decision.snapshot);
      } else if (decision.action === "coerce") {
        const state = (viewState as { state: Record<string, unknown> }).state;
        state.mode = decision.snapshot.mode;
        state.source = decision.snapshot.source;
      }
      return original.call(this, viewState, eState);
    };
    this.patchedSetViewState = patchedSetViewState;
    proto.setViewState = patchedSetViewState;
    this.plugin.register(() => {
      if (
        this.originalSetViewState &&
        this.patchedSetViewState &&
        proto.setViewState === this.patchedSetViewState
      ) {
        proto.setViewState = this.originalSetViewState;
      }
      this.originalSetViewState = null;
      this.patchedSetViewState = null;
    });
  }
}
