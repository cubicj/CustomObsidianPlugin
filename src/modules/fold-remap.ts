import { MarkdownView, Plugin, TFile } from "obsidian";
import type { CachedMetadata } from "obsidian";
import {
  collectCurrentHeadings,
  decideFoldReapply,
  enrichSignatures,
  hasPropertiesFoldMarker,
  remapFoldEntry,
  shouldReapplyFoldEntry,
} from "./fold-remap-utils";
import type { RemapOutcome } from "./fold-remap-utils";
import { countLines } from "./reading-folds-utils";
import type { AppWithFoldManager, FoldManagerSave } from "./obsidian-internals";

export interface FoldRemapSettings {
  enabled: boolean;
}

export const DEFAULT_FOLD_REMAP_SETTINGS: FoldRemapSettings = {
  enabled: true,
};

interface AppLike extends AppWithFoldManager {
  appId?: unknown;
  loadLocalStorage?: (key: string) => unknown;
  saveLocalStorage?: (key: string, value: unknown) => unknown;
}

interface FoldModeLike {
  applyFoldInfo?: (info: unknown) => unknown;
  getFoldInfo?: () => unknown;
}

interface FoldViewLike {
  currentMode?: FoldModeLike;
  metadataEditor?: {
    setCollapse?: (collapsed: boolean, animate: boolean) => unknown;
  };
}

interface PendingViewRetry {
  attempt: number;
  timer: number | null;
}

interface PendingPathRetries {
  targetData: string;
  entry: Record<string, unknown>;
  views: Map<MarkdownView, PendingViewRetry>;
}

const REAPPLY_INTERVAL_MS = 200;
const REAPPLY_MAX_ATTEMPTS = 10;

function logFoldRemap(
  path: string | undefined,
  stage: string,
  error: unknown,
): void {
  console.debug("CubicJ Core fold-remap", path ?? "<unknown>", stage, error);
}

export class FoldRemapManager {
  private originalSave: FoldManagerSave | null = null;
  private patchedSave: FoldManagerSave | null = null;
  private pendingRetries = new Map<string, PendingPathRetries>();
  private disposed = false;

  constructor(
    private plugin: Plugin,
    private getSettings: () => FoldRemapSettings,
  ) {}

  register(): void {
    const app = this.plugin.app as unknown as AppLike;
    const foldManager = app.foldManager;
    if (
      !foldManager ||
      typeof foldManager.save !== "function" ||
      typeof app.loadLocalStorage !== "function" ||
      typeof app.saveLocalStorage !== "function"
    ) {
      return;
    }
    this.disposed = false;
    const originalSave = foldManager.save;
    this.originalSave = originalSave;
    const enrich = (file: TFile | null, info: unknown): unknown =>
      this.enrich(file, info);
    const patchedSave: FoldManagerSave = function (
      file: TFile | null,
      info: unknown,
    ) {
      return originalSave.call(foldManager, file, enrich(file, info));
    };
    this.patchedSave = patchedSave;
    foldManager.save = patchedSave;
    this.plugin.register(() => {
      this.disposed = true;
      this.clearAllPending();
      if (
        this.originalSave &&
        this.patchedSave &&
        foldManager.save === this.patchedSave
      ) {
        foldManager.save = this.originalSave;
      }
      this.originalSave = null;
      this.patchedSave = null;
    });
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file, data, cache) => {
        this.handleChanged(file, data, cache);
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => {
        this.clearPendingPath(oldPath);
        this.clearPendingPath(file.path);
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("delete", (file) => {
        this.clearPendingPath(file.path);
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => {
        this.pruneDetachedViews();
      }),
    );
    const resolvedRef = this.plugin.app.metadataCache.on("resolved", () => {
      this.plugin.app.metadataCache.offref(resolvedRef);
      void this.runStartupSweep();
    });
    this.plugin.registerEvent(resolvedRef);
  }

  private enrich(file: TFile | null, info: unknown): unknown {
    try {
      if (!this.getSettings().enabled || !(file instanceof TFile)) {
        return info;
      }
      if (typeof info !== "object" || info === null) {
        return info;
      }
      const folds = (info as { folds?: unknown }).folds;
      if (!Array.isArray(folds)) {
        return info;
      }
      const app = this.plugin.app as unknown as AppLike;
      const priorEntry = app.loadLocalStorage?.("note-fold-" + file.path);
      const priorSignatures =
        typeof priorEntry === "object" && priorEntry !== null
          ? (priorEntry as { cubicjHeadings?: unknown }).cubicjHeadings
          : undefined;
      const headings = collectCurrentHeadings(
        this.plugin.app.metadataCache.getFileCache(file)?.headings,
      );
      return {
        ...(info as Record<string, unknown>),
        cubicjHeadings: enrichSignatures(
          folds,
          headings,
          this.getOpenDocumentLines(file),
          priorSignatures,
        ),
      };
    } catch (error) {
      logFoldRemap(file instanceof TFile ? file.path : undefined, "enrich", error);
      return info;
    }
  }

  private getOpenDocumentLines(file: TFile): string[] | null {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.file?.path !== file.path) {
        continue;
      }
      try {
        return view.getViewData().split("\n");
      } catch (error) {
        logFoldRemap(file.path, "view-data", error);
      }
    }
    return null;
  }

  private handleChanged(file: TFile, data: string, cache: CachedMetadata): void {
    this.clearPendingPath(file.path);
    if (this.disposed || !this.getSettings().enabled) {
      return;
    }
    try {
      const app = this.plugin.app as unknown as AppLike;
      const entry = app.loadLocalStorage?.("note-fold-" + file.path);
      if (entry === null || entry === undefined) {
        return;
      }
      const outcome = remapFoldEntry(
        entry,
        collectCurrentHeadings(cache.headings),
        countLines(data),
      );
      this.applyChangedOutcome(file, entry, outcome, data);
    } catch (error) {
      logFoldRemap(file.path, "changed", error);
    }
  }

  private async runStartupSweep(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const app = this.plugin.app as unknown as AppLike;
    const appId = app.appId;
    if (typeof appId !== "string" || appId.length === 0) {
      return;
    }
    const prefix = appId + "-note-fold-";
    const keys: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key);
        }
      }
    } catch (error) {
      logFoldRemap(undefined, "sweep-scan", error);
      return;
    }
    for (const key of keys) {
      if (this.disposed || !this.getSettings().enabled) {
        return;
      }
      const path = key.slice(prefix.length);
      try {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
          continue;
        }
        const entry = app.loadLocalStorage?.("note-fold-" + path);
        if (entry === null || entry === undefined) {
          continue;
        }
        const signatures = (entry as { cubicjHeadings?: unknown }).cubicjHeadings;
        if (!Array.isArray(signatures) || signatures.length === 0) {
          continue;
        }
        const serializedEntry = JSON.stringify(entry);
        const content = await this.plugin.app.vault.cachedRead(file);
        if (this.disposed) {
          return;
        }
        if (!this.getSettings().enabled) {
          return;
        }
        if (file.path !== path) {
          continue;
        }
        const currentEntry = app.loadLocalStorage?.("note-fold-" + path);
        if (currentEntry === null || currentEntry === undefined) {
          continue;
        }
        if (JSON.stringify(currentEntry) !== serializedEntry) {
          continue;
        }
        const headings = collectCurrentHeadings(
          this.plugin.app.metadataCache.getFileCache(file)?.headings,
        );
        this.applyStartupOutcome(
          file,
          remapFoldEntry(currentEntry, headings, countLines(content)),
          content,
        );
      } catch (error) {
        logFoldRemap(path, "sweep", error);
      }
    }
  }

  private applyChangedOutcome(
    file: TFile,
    entry: unknown,
    outcome: RemapOutcome,
    data: string,
  ): void {
    const app = this.plugin.app as unknown as AppLike;
    if (outcome.action === "delete") {
      app.saveLocalStorage?.("note-fold-" + file.path, null);
      return;
    }
    if (outcome.action === "write") {
      app.saveLocalStorage?.("note-fold-" + file.path, outcome.value);
      this.reapplyToOpenViews(file, outcome.value, data, true);
      return;
    }
    if (outcome.action === "keep") {
      this.reapplyToOpenViews(
        file,
        entry as Record<string, unknown>,
        data,
        true,
      );
    }
  }

  private applyStartupOutcome(
    file: TFile,
    outcome: RemapOutcome,
    data: string,
  ): void {
    const app = this.plugin.app as unknown as AppLike;
    if (outcome.action === "delete") {
      app.saveLocalStorage?.("note-fold-" + file.path, null);
      return;
    }
    if (outcome.action === "write") {
      app.saveLocalStorage?.("note-fold-" + file.path, outcome.value);
      this.reapplyToOpenViews(file, outcome.value, data, false);
    }
  }

  private reapplyToOpenViews(
    file: TFile,
    entry: Record<string, unknown>,
    targetData: string,
    supersede: boolean,
  ): void {
    if (this.disposed) {
      return;
    }
    if (supersede) {
      this.clearPendingPath(file.path);
    } else if (this.pendingRetries.has(file.path)) {
      return;
    }
    const views = new Map<MarkdownView, PendingViewRetry>();
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === file.path) {
        views.set(view, { attempt: 1, timer: null });
      }
    }
    if (views.size === 0) {
      return;
    }
    const state: PendingPathRetries = { targetData, entry, views };
    this.pendingRetries.set(file.path, state);
    for (const view of [...views.keys()]) {
      this.attemptReapply(file.path, state, view);
    }
  }

  private attemptReapply(
    path: string,
    state: PendingPathRetries,
    view: MarkdownView,
  ): void {
    if (this.disposed || this.pendingRetries.get(path) !== state) {
      return;
    }
    const pending = state.views.get(view);
    if (!pending) {
      return;
    }
    try {
      if (!this.isOpenView(view, path)) {
        this.removePendingView(path, state, view);
        return;
      }
      const decision = decideFoldReapply(
        view.getViewData(),
        state.targetData,
        pending.attempt,
        REAPPLY_MAX_ATTEMPTS,
      );
      if (decision === "apply") {
        this.applyFoldInfo(view, state.entry);
        this.removePendingView(path, state, view);
        return;
      }
      if (decision === "exhausted") {
        logFoldRemap(
          path,
          "retry-exhausted",
          new Error("view did not reach the target content revision"),
        );
        this.removePendingView(path, state, view);
        return;
      }
      pending.timer = window.setTimeout(() => {
        pending.timer = null;
        pending.attempt += 1;
        this.attemptReapply(path, state, view);
      }, REAPPLY_INTERVAL_MS);
    } catch (error) {
      logFoldRemap(path, "reapply", error);
      this.removePendingView(path, state, view);
    }
  }

  private applyFoldInfo(
    view: MarkdownView,
    entry: Record<string, unknown>,
  ): void {
    const viewLike = view as unknown as FoldViewLike;
    const mode = viewLike.currentMode;
    if (mode && typeof mode.applyFoldInfo === "function") {
      if (
        typeof mode.getFoldInfo !== "function" ||
        shouldReapplyFoldEntry(mode.getFoldInfo(), entry)
      ) {
        mode.applyFoldInfo(entry);
      }
    }
    const metadataEditor = viewLike.metadataEditor;
    if (
      metadataEditor &&
      typeof metadataEditor.setCollapse === "function" &&
      hasPropertiesFoldMarker(entry.folds, entry.cubicjHeadings)
    ) {
      metadataEditor.setCollapse(true, false);
    }
  }

  private isOpenView(view: MarkdownView, path: string): boolean {
    return this.plugin.app.workspace
      .getLeavesOfType("markdown")
      .some((leaf) => leaf.view === view && view.file?.path === path);
  }

  private pruneDetachedViews(): void {
    for (const [path, state] of this.pendingRetries) {
      try {
        const liveViews = new Set(
          this.plugin.app.workspace
            .getLeavesOfType("markdown")
            .map((leaf) => leaf.view),
        );
        for (const view of [...state.views.keys()]) {
          if (!liveViews.has(view) || view.file?.path !== path) {
            this.removePendingView(path, state, view);
          }
        }
      } catch (error) {
        logFoldRemap(path, "prune", error);
        this.clearPendingPath(path);
      }
    }
  }

  private removePendingView(
    path: string,
    state: PendingPathRetries,
    view: MarkdownView,
  ): void {
    const pending = state.views.get(view);
    if (pending?.timer !== null && pending?.timer !== undefined) {
      window.clearTimeout(pending.timer);
    }
    state.views.delete(view);
    if (state.views.size === 0 && this.pendingRetries.get(path) === state) {
      this.pendingRetries.delete(path);
    }
  }

  private clearPendingPath(path: string): void {
    const state = this.pendingRetries.get(path);
    if (!state) {
      return;
    }
    for (const pending of state.views.values()) {
      if (pending.timer !== null) {
        window.clearTimeout(pending.timer);
      }
    }
    this.pendingRetries.delete(path);
  }

  private clearAllPending(): void {
    for (const path of [...this.pendingRetries.keys()]) {
      this.clearPendingPath(path);
    }
  }
}
