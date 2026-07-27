import { Plugin } from "obsidian";
import { enableNoAutoFocus, disableNoAutoFocus } from "./modules/no-auto-focus";
import { FontLoader, FontSettings, DEFAULT_FONT_SETTINGS } from "./modules/font-loader";
import { FrontmatterDateManager } from "./modules/frontmatter-dates";
import { DEFAULT_FRONTMATTER_DATE_SETTINGS } from "./modules/frontmatter-date-utils";
import type { FrontmatterDateSettings } from "./modules/frontmatter-date-utils";
import { createHeadingEnterExtension } from "./modules/note-format-editor";
import { DEFAULT_NOTE_FORMAT_SETTINGS } from "./modules/note-format-utils";
import type { NoteFormatSettings } from "./modules/note-format-utils";
import {
  DEFAULT_FOLD_PROPERTIES_SETTINGS,
  FoldPropertiesManager,
} from "./modules/fold-properties";
import type { FoldPropertiesSettings } from "./modules/fold-properties";
import {
  DEFAULT_VAULT_REPLACE_SETTINGS,
  VaultReplaceManager,
} from "./modules/vault-replace";
import type { VaultReplaceSettings } from "./modules/vault-replace";
import { CubicJCoreSettingTab } from "./settings-tab";

interface CubicJCoreSettings {
  font: FontSettings;
  frontmatterDates: FrontmatterDateSettings;
  noteFormat: NoteFormatSettings;
  foldProperties: FoldPropertiesSettings;
  vaultReplace: VaultReplaceSettings;
}

const DEFAULT_SETTINGS: CubicJCoreSettings = {
  font: DEFAULT_FONT_SETTINGS,
  frontmatterDates: DEFAULT_FRONTMATTER_DATE_SETTINGS,
  noteFormat: DEFAULT_NOTE_FORMAT_SETTINGS,
  foldProperties: DEFAULT_FOLD_PROPERTIES_SETTINGS,
  vaultReplace: DEFAULT_VAULT_REPLACE_SETTINGS,
};

export default class CubicJCorePlugin extends Plugin {
  settings!: CubicJCoreSettings;
  fontLoader!: FontLoader;
  frontmatterDates!: FrontmatterDateManager;
  foldProperties!: FoldPropertiesManager;
  vaultReplace!: VaultReplaceManager;

  async onload() {
    await this.loadSettings();
    enableNoAutoFocus();

    this.fontLoader = new FontLoader(this.app);
    await this.fontLoader.load(this.settings.font);

    this.frontmatterDates = new FrontmatterDateManager(
      this,
      this.settings.frontmatterDates,
      this.settings.noteFormat,
    );
    this.frontmatterDates.register();

    this.foldProperties = new FoldPropertiesManager(this, this.settings.foldProperties);
    this.foldProperties.register();

    this.vaultReplace = new VaultReplaceManager(this, this.settings.vaultReplace);
    this.vaultReplace.register();

    this.registerEditorExtension(createHeadingEnterExtension(() => this.settings.noteFormat));
    this.addSettingTab(new CubicJCoreSettingTab(this.app, this));
    console.log("CubicJ Core loaded");
  }

  async onunload() {
    disableNoAutoFocus();
    this.fontLoader?.unload();
    try {
      await this.frontmatterDates?.flushPendingModifiedWrite();
    } catch (error) {
      console.warn("CubicJ Core failed to flush pending frontmatter date", error);
    }
    console.log("CubicJ Core unloaded");
  }

  async loadSettings() {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.font = Object.assign({}, DEFAULT_FONT_SETTINGS, this.settings.font);
    this.settings.frontmatterDates = Object.assign(
      {},
      DEFAULT_FRONTMATTER_DATE_SETTINGS,
      this.settings.frontmatterDates,
    );
    this.settings.noteFormat = Object.assign(
      {},
      DEFAULT_NOTE_FORMAT_SETTINGS,
      this.settings.noteFormat,
    );
    const legacyDates = data?.frontmatterDates as { normalizeTrailingNewline?: unknown } | undefined;
    if (data?.noteFormat === undefined && typeof legacyDates?.normalizeTrailingNewline === "boolean") {
      this.settings.noteFormat.normalizeTrailingNewline = legacyDates.normalizeTrailingNewline;
    }
    delete (this.settings.frontmatterDates as { normalizeTrailingNewline?: boolean })
      .normalizeTrailingNewline;
    this.settings.foldProperties = Object.assign(
      {},
      DEFAULT_FOLD_PROPERTIES_SETTINGS,
      this.settings.foldProperties,
    );
    this.settings.vaultReplace = Object.assign(
      {},
      DEFAULT_VAULT_REPLACE_SETTINGS,
      this.settings.vaultReplace,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.frontmatterDates?.updateSettings(this.settings.frontmatterDates, this.settings.noteFormat);
    this.foldProperties?.updateSettings(this.settings.foldProperties);
    this.vaultReplace?.updateSettings(this.settings.vaultReplace);
  }
}
