import { MarkdownView, Plugin, TFile } from "obsidian";
import type { CachedMetadata } from "obsidian";
import {
  buildHeadingSignatures,
  collectCurrentHeadings,
  remapFoldEntry,
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
}

interface FoldViewLike {
  currentMode?: FoldModeLike;
  metadataEditor?: {
    setCollapse?: (collapsed: boolean, animate: boolean) => unknown;
  };
}

export class FoldRemapManager {
  private originalSave: FoldManagerSave | null = null;
  private localEditPaths = new Set<string>();

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
    const originalSave = foldManager.save;
    this.originalSave = originalSave;
    const manager = this;
    foldManager.save = function (file: TFile | null, info: unknown) {
      return originalSave.call(foldManager, file, manager.enrich(file, info));
    };
    this.plugin.register(() => {
      if (this.originalSave) {
        foldManager.save = this.originalSave;
        this.originalSave = null;
      }
    });
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("editor-change", (editor, info) => {
        if (
          this.getSettings().enabled &&
          info.file instanceof TFile &&
          editor.hasFocus()
        ) {
          this.localEditPaths.add(info.file.path);
        }
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file, data, cache) => {
        this.handleChanged(file, data, cache);
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
      const headings = collectCurrentHeadings(
        this.plugin.app.metadataCache.getFileCache(file)?.headings,
      );
      return {
        ...(info as Record<string, unknown>),
        cubicjHeadings: buildHeadingSignatures(folds, headings),
      };
    } catch {
      return info;
    }
  }

  private handleChanged(file: TFile, data: string, cache: CachedMetadata): void {
    if (!this.getSettings().enabled) {
      this.localEditPaths.delete(file.path);
      return;
    }
    try {
      const app = this.plugin.app as unknown as AppLike;
      const entry = app.loadLocalStorage?.("note-fold-" + file.path);
      if (entry === null || entry === undefined) {
        this.localEditPaths.delete(file.path);
        return;
      }
      const outcome = remapFoldEntry(
        entry,
        collectCurrentHeadings(cache.headings),
        countLines(data),
      );
      const locallyEdited = this.localEditPaths.delete(file.path);
      this.applyChangedOutcome(file, entry, outcome, locallyEdited);
    } catch {
      this.localEditPaths.delete(file.path);
    }
  }

  private async runStartupSweep(): Promise<void> {
    const app = this.plugin.app as unknown as AppLike;
    const appId = app.appId;
    if (typeof appId !== "string" || appId.length === 0) {
      return;
    }
    const prefix = appId + "-note-fold-";
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      if (!this.getSettings().enabled) {
        return;
      }
      try {
        const path = key.slice(prefix.length);
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
        const content = await this.plugin.app.vault.cachedRead(file);
        const headings = collectCurrentHeadings(
          this.plugin.app.metadataCache.getFileCache(file)?.headings,
        );
        this.applyStartupOutcome(
          file,
          remapFoldEntry(entry, headings, countLines(content)),
        );
      } catch {
      }
    }
  }

  private applyChangedOutcome(
    file: TFile,
    entry: unknown,
    outcome: RemapOutcome,
    locallyEdited: boolean,
  ): void {
    const app = this.plugin.app as unknown as AppLike;
    if (outcome.action === "delete") {
      app.saveLocalStorage?.("note-fold-" + file.path, null);
      return;
    }
    if (outcome.action === "write") {
      app.saveLocalStorage?.("note-fold-" + file.path, outcome.value);
      if (!locallyEdited) {
        this.reapplyToOpenViews(file, outcome.value);
      }
      return;
    }
    if (outcome.action === "keep" && !locallyEdited) {
      this.reapplyToOpenViews(file, entry as Record<string, unknown>);
    }
  }

  private applyStartupOutcome(file: TFile, outcome: RemapOutcome): void {
    const app = this.plugin.app as unknown as AppLike;
    if (outcome.action === "delete") {
      app.saveLocalStorage?.("note-fold-" + file.path, null);
      return;
    }
    if (outcome.action === "write") {
      app.saveLocalStorage?.("note-fold-" + file.path, outcome.value);
      this.reapplyToOpenViews(file, outcome.value);
    }
  }

  private reapplyToOpenViews(file: TFile, entry: Record<string, unknown>): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.file?.path !== file.path) {
        continue;
      }
      try {
        const viewLike = view as unknown as FoldViewLike;
        const mode = viewLike.currentMode;
        if (mode && typeof mode.applyFoldInfo === "function") {
          mode.applyFoldInfo(entry);
        }
        const metadataEditor = viewLike.metadataEditor;
        const folds = entry.folds;
        if (
          metadataEditor &&
          typeof metadataEditor.setCollapse === "function" &&
          Array.isArray(folds)
        ) {
          const collapsed = folds.some(
            (fold) =>
              typeof fold === "object" &&
              fold !== null &&
              (fold as { from?: unknown }).from === 0,
          );
          metadataEditor.setCollapse(collapsed, false);
        }
      } catch {
      }
    }
  }
}
