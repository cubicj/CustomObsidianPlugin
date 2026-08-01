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
    const manager = this;
    foldManager.load = function (file: TFile | null) {
      const info = originalLoad.call(foldManager, file);
      if (!manager.getSettings().enabled || !file || !manager.hasFrontmatter(file)) {
        return info;
      }
      return injectPropertiesFold(info);
    };
    this.plugin.register(() => {
      if (this.originalLoad) {
        foldManager.load = this.originalLoad;
        this.originalLoad = null;
      }
    });
  }

  private hasFrontmatter(file: TFile): boolean {
    return Boolean(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter);
  }
}
