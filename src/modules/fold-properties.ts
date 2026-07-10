import { MarkdownView, Plugin, TFile } from "obsidian";
import { ViewFoldTracker } from "./fold-properties-utils";

interface AppWithCommands {
  commands: {
    executeCommandById(commandId: string): boolean;
  };
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
  private tracker = new ViewFoldTracker();

  constructor(plugin: Plugin, settings: FoldPropertiesSettings) {
    this.plugin = plugin;
    this.settings = settings;
  }

  register(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("file-open", (file) => this.handleFileOpen(file)),
    );
  }

  updateSettings(settings: FoldPropertiesSettings): void {
    this.settings = settings;
  }

  private handleFileOpen(file: TFile | null): void {
    if (!this.settings.enabled || !file) {
      return;
    }
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== file.path) {
      return;
    }
    if (!this.tracker.shouldFold(view, file.path)) {
      return;
    }
    this.tracker.markFolded(view, file.path);
    this.foldIfExpanded(view);
  }

  private foldIfExpanded(view: MarkdownView): void {
    const container = view.containerEl.querySelector(".metadata-container");
    if (!container || container.classList.contains("is-collapsed")) {
      return;
    }
    const commands = (this.plugin.app as unknown as AppWithCommands).commands;
    const executed = commands.executeCommandById("editor:toggle-fold-properties");
    if (!executed) {
      const heading = container.querySelector<HTMLElement>(".metadata-properties-heading");
      heading?.click();
    }
  }
}
