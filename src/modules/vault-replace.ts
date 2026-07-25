import { Plugin, TFile } from "obsidian";
import {
  VAULT_REPLACE_STYLE_ID,
  VAULT_REPLACE_STYLES,
  VaultReplaceModal,
} from "./vault-replace-modal";
import { applyReplace, findMatches } from "./vault-replace-utils";
import type { Match } from "./vault-replace-utils";

export interface VaultReplaceSettings {
  enabled: boolean;
}

export const DEFAULT_VAULT_REPLACE_SETTINGS: VaultReplaceSettings = {
  enabled: true,
};

export const VAULT_REPLACE_COMMAND_ID = "open-vault-replace";

export interface FileMatches {
  file: TFile;
  matches: Match[];
}

export interface ReplaceResult {
  files: number;
  matches: number;
  failed: number;
}

export class VaultReplaceManager {
  private plugin: Plugin;
  private settings: VaultReplaceSettings;
  private registered = false;

  constructor(plugin: Plugin, settings: VaultReplaceSettings) {
    this.plugin = plugin;
    this.settings = settings;
  }

  register(): void {
    this.injectStyles();
    this.syncCommand();
  }

  updateSettings(settings: VaultReplaceSettings): void {
    this.settings = settings;
    this.syncCommand();
  }

  async scan(regex: RegExp): Promise<FileMatches[]> {
    const results: FileMatches[] = [];
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const content = await this.plugin.app.vault.cachedRead(file);
      const matches = findMatches(content, regex);
      if (matches.length > 0) {
        results.push({ file, matches });
      }
    }
    results.sort((left, right) => left.file.path.localeCompare(right.file.path));
    return results;
  }

  async replace(
    targets: FileMatches[],
    regex: RegExp,
    replacement: string,
    useRegex: boolean,
  ): Promise<ReplaceResult> {
    const result: ReplaceResult = { files: 0, matches: 0, failed: 0 };
    for (const target of targets) {
      try {
        const current = await this.plugin.app.vault.read(target.file);
        const matches = findMatches(current, regex);
        if (matches.length === 0) {
          continue;
        }
        await this.plugin.app.vault.process(target.file, (latest) =>
          applyReplace(latest, regex, replacement, useRegex),
        );
        result.files++;
        result.matches += matches.length;
      } catch (error) {
        result.failed++;
        console.warn("CubicJ Core vault replace failed", target.file.path, error);
      }
    }
    return result;
  }

  private syncCommand(): void {
    if (this.settings.enabled) {
      if (this.registered) {
        return;
      }
      this.plugin.addCommand({
        id: VAULT_REPLACE_COMMAND_ID,
        name: "Find and replace in all files",
        hotkeys: [{ modifiers: ["Mod", "Shift"], key: "H" }],
        callback: () => {
          new VaultReplaceModal(this.plugin.app, this).open();
        },
      });
      this.registered = true;
      return;
    }
    if (!this.registered) {
      return;
    }
    this.plugin.removeCommand(VAULT_REPLACE_COMMAND_ID);
    this.registered = false;
  }

  private injectStyles(): void {
    document.getElementById(VAULT_REPLACE_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = VAULT_REPLACE_STYLE_ID;
    style.textContent = VAULT_REPLACE_STYLES;
    document.head.appendChild(style);
    this.plugin.register(() => {
      document.getElementById(VAULT_REPLACE_STYLE_ID)?.remove();
    });
  }
}
