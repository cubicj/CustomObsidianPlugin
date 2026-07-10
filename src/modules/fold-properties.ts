import { Plugin, TFile } from "obsidian";
import { injectPropertiesFold } from "./fold-properties-utils";

type FoldManagerLoad = (file: TFile | null) => unknown;

interface FoldManagerLike {
  load: FoldManagerLoad;
}

interface AppWithFoldManager {
  foldManager?: FoldManagerLike;
}

export interface FoldPropertiesSettings {
  enabled: boolean;
}

export const DEFAULT_FOLD_PROPERTIES_SETTINGS: FoldPropertiesSettings = {
  enabled: true,
};

export class FoldPropertiesManager {
  private plugin: Plugin;
  private settings: FoldPropertiesSettings;
  private originalLoad: FoldManagerLoad | null = null;

  constructor(plugin: Plugin, settings: FoldPropertiesSettings) {
    this.plugin = plugin;
    this.settings = settings;
  }

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
      if (!manager.settings.enabled || !file || !manager.hasFrontmatter(file)) {
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

  updateSettings(settings: FoldPropertiesSettings): void {
    this.settings = settings;
  }

  private hasFrontmatter(file: TFile): boolean {
    return Boolean(this.plugin.app.metadataCache.getFileCache(file)?.frontmatter);
  }
}
