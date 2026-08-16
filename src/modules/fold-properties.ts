import { Plugin, TFile } from "obsidian";
import { injectPropertiesFold } from "./fold-properties-utils";
import type { AppWithFoldManager, FoldManagerLoad } from "./obsidian-internals";

export interface FoldPropertiesSettings {
  enabled: boolean;
}

export const DEFAULT_FOLD_PROPERTIES_SETTINGS: FoldPropertiesSettings = {
  enabled: true,
};

export class FoldPropertiesManager {
  private originalLoad: FoldManagerLoad | null = null;
  private patchedLoad: FoldManagerLoad | null = null;

  constructor(
    private plugin: Plugin,
    private getSettings: () => FoldPropertiesSettings,
  ) {}

  register(): void {
    const foldManager = (this.plugin.app as unknown as AppWithFoldManager).foldManager;
    if (!foldManager || typeof foldManager.load !== "function") {
      return;
    }
    const originalLoad = foldManager.load;
    this.originalLoad = originalLoad;
    const getSettings = this.getSettings;
    const hasFrontmatter = (file: TFile): boolean => this.hasFrontmatter(file);
    const patchedLoad: FoldManagerLoad = function (file: TFile | null) {
      const info = originalLoad.call(foldManager, file);
      if (!getSettings().enabled || !file || !hasFrontmatter(file)) {
        return info;
      }
      return injectPropertiesFold(info);
    };
    this.patchedLoad = patchedLoad;
    foldManager.load = patchedLoad;
    this.plugin.register(() => {
      if (
        this.originalLoad &&
        this.patchedLoad &&
        foldManager.load === this.patchedLoad
      ) {
        foldManager.load = this.originalLoad;
      }
      this.originalLoad = null;
      this.patchedLoad = null;
    });
  }

  private hasFrontmatter(file: TFile): boolean {
    return Boolean(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter);
  }
}
