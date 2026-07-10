import { MarkdownView, Plugin, TFile } from "obsidian";
import { ViewFoldTracker } from "./fold-properties-utils";

interface AppWithCommands {
  commands: {
    executeCommandById(commandId: string): boolean;
  };
}

interface ViewWithMetadataEditor {
  metadataEditor?: {
    setCollapse?(collapsed: boolean, animate: boolean): void;
  };
}

const OBSERVE_TIMEOUT_MS = 2000;

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
  private observers = new Map<MarkdownView, { observer: MutationObserver; timeoutId: number }>();

  constructor(plugin: Plugin, settings: FoldPropertiesSettings) {
    this.plugin = plugin;
    this.settings = settings;
  }

  register(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("file-open", (file) => this.handleFileOpen(file)),
    );
    this.plugin.register(() => this.disconnectAllObservers());
  }

  updateSettings(settings: FoldPropertiesSettings): void {
    this.settings = settings;
    if (!settings.enabled) {
      this.disconnectAllObservers();
    }
  }

  private handleFileOpen(file: TFile | null): void {
    if (!this.settings.enabled || !file) {
      return;
    }
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== file.path) {
      return;
    }
    this.disconnectObserver(view);
    if (!this.tracker.shouldFold(view, file.path)) {
      return;
    }
    if (!this.tryFold(view, file.path)) {
      this.observeUntilFolded(view, file.path);
    }
  }

  private observeUntilFolded(view: MarkdownView, path: string): void {
    const observer = new MutationObserver(() => {
      if (!this.settings.enabled || view.file?.path !== path || !this.tracker.shouldFold(view, path)) {
        this.disconnectObserver(view);
        return;
      }
      if (this.tryFold(view, path)) {
        this.disconnectObserver(view);
      }
    });
    observer.observe(view.containerEl, { childList: true, subtree: true });
    const timeoutId = window.setTimeout(() => this.disconnectObserver(view), OBSERVE_TIMEOUT_MS);
    this.observers.set(view, { observer, timeoutId });
  }

  private disconnectObserver(view: MarkdownView): void {
    const entry = this.observers.get(view);
    if (!entry) {
      return;
    }
    entry.observer.disconnect();
    window.clearTimeout(entry.timeoutId);
    this.observers.delete(view);
  }

  private disconnectAllObservers(): void {
    for (const view of [...this.observers.keys()]) {
      this.disconnectObserver(view);
    }
  }

  private tryFold(view: MarkdownView, path: string): boolean {
    const container = view.containerEl.querySelector(".metadata-container");
    if (!container) {
      return false;
    }
    this.tracker.markFolded(view, path);
    if (container.classList.contains("is-collapsed")) {
      return true;
    }
    const metadataEditor = (view as unknown as ViewWithMetadataEditor).metadataEditor;
    if (typeof metadataEditor?.setCollapse === "function") {
      metadataEditor.setCollapse(true, false);
      return true;
    }
    const commands = (this.plugin.app as unknown as AppWithCommands).commands;
    const executed = commands.executeCommandById("editor:toggle-fold-properties");
    if (!executed) {
      const heading = container.querySelector<HTMLElement>(".metadata-properties-heading");
      heading?.click();
    }
    return true;
  }
}
