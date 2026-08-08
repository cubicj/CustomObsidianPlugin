import { Plugin, TFile } from "obsidian";
import {
  VAULT_REPLACE_STYLE_ID,
  VAULT_REPLACE_STYLES,
  VaultReplaceModal,
} from "./vault-replace-modal";
import { applyReplace, findMatches, scanMatchingFiles } from "./vault-replace-utils";
import type { ScannedFileMatches } from "./vault-replace-utils";

export interface VaultReplaceSettings {
  enabled: boolean;
}

export const DEFAULT_VAULT_REPLACE_SETTINGS: VaultReplaceSettings = {
  enabled: true,
};

export const VAULT_REPLACE_COMMAND_ID = "open-vault-replace";

export type FileMatches = ScannedFileMatches<TFile>;

export interface ScanResult {
  results: FileMatches[];
  failed: number;
}

export interface ReplaceResult {
  files: number;
  matches: number;
  failed: number;
}

export class VaultReplaceManager {
  private registered = false;

  constructor(
    private plugin: Plugin,
    private getSettings: () => VaultReplaceSettings,
  ) {}

  register(): void {
    this.injectStyles();
    this.syncCommand();
  }

  async scan(regex: RegExp): Promise<ScanResult> {
    return scanMatchingFiles(
      this.plugin.app.vault.getMarkdownFiles(),
      regex,
      (file) => this.plugin.app.vault.cachedRead(file),
      (file, error) => {
        console.warn("CubicJ Core vault replace scan failed", file.path, error);
      },
    );
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
    if (this.getSettings().enabled) {
      if (this.registered) {
        return;
      }
      this.plugin.addCommand({
        id: VAULT_REPLACE_COMMAND_ID,
        name: "전체 파일 찾아 바꾸기",
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
