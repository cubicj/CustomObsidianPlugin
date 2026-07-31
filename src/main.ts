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
  createEagerParseExtension,
  DEFAULT_EAGER_PARSE_SETTINGS,
} from "./modules/eager-parse";
import type { EagerParseSettings } from "./modules/eager-parse";
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
import {
  DEFAULT_STICKY_VIEW_MODE_SETTINGS,
  StickyViewModeManager,
} from "./modules/sticky-view-mode";
import type { StickyViewModeSettings } from "./modules/sticky-view-mode";
import {
  DEFAULT_READING_FOLDS_SETTINGS,
  ReadingFoldsManager,
} from "./modules/reading-folds";
import type { ReadingFoldsSettings } from "./modules/reading-folds";
import { CubicJCoreSettingTab } from "./settings-tab";

interface CubicJCoreSettings {
  font: FontSettings;
  frontmatterDates: FrontmatterDateSettings;
  noteFormat: NoteFormatSettings;
  eagerParse: EagerParseSettings;
  foldProperties: FoldPropertiesSettings;
  vaultReplace: VaultReplaceSettings;
  stickyViewMode: StickyViewModeSettings;
  readingFolds: ReadingFoldsSettings;
}

const DEFAULT_SETTINGS: CubicJCoreSettings = {
  font: DEFAULT_FONT_SETTINGS,
  frontmatterDates: DEFAULT_FRONTMATTER_DATE_SETTINGS,
  noteFormat: DEFAULT_NOTE_FORMAT_SETTINGS,
  eagerParse: DEFAULT_EAGER_PARSE_SETTINGS,
  foldProperties: DEFAULT_FOLD_PROPERTIES_SETTINGS,
  vaultReplace: DEFAULT_VAULT_REPLACE_SETTINGS,
  stickyViewMode: DEFAULT_STICKY_VIEW_MODE_SETTINGS,
  readingFolds: DEFAULT_READING_FOLDS_SETTINGS,
};

export default class CubicJCorePlugin extends Plugin {
  settings!: CubicJCoreSettings;
  fontLoader!: FontLoader;
  frontmatterDates!: FrontmatterDateManager;
  foldProperties!: FoldPropertiesManager;
  vaultReplace!: VaultReplaceManager;
  stickyViewMode!: StickyViewModeManager;
  readingFolds!: ReadingFoldsManager;

  async onload() {
    await this.loadSettings();
    enableNoAutoFocus();
    this.register(disableNoAutoFocus);

    this.fontLoader = new FontLoader(this.app);
    this.register(() => this.fontLoader.unload());
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

    this.stickyViewMode = new StickyViewModeManager(this, this.settings.stickyViewMode);
    this.stickyViewMode.register();

    this.readingFolds = new ReadingFoldsManager(this, this.settings.readingFolds);
    this.readingFolds.register();

    this.registerEditorExtension(createHeadingEnterExtension(() => this.settings.noteFormat));
    this.registerEditorExtension(createEagerParseExtension(() => this.settings.eagerParse));
    this.addSettingTab(new CubicJCoreSettingTab(this.app, this));
    console.log("CubicJ Core loaded");
  }

  onunload() {
    void this.frontmatterDates?.flushPendingModifiedWrite().catch((error) => {
      console.warn("CubicJ Core failed to flush pending frontmatter date", error);
    });
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
    this.settings.eagerParse = Object.assign(
      {},
      DEFAULT_EAGER_PARSE_SETTINGS,
      this.settings.eagerParse,
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
    this.settings.stickyViewMode = Object.assign(
      {},
      DEFAULT_STICKY_VIEW_MODE_SETTINGS,
      this.settings.stickyViewMode,
    );
    this.settings.readingFolds = Object.assign(
      {},
      DEFAULT_READING_FOLDS_SETTINGS,
      this.settings.readingFolds,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.frontmatterDates?.updateSettings(this.settings.frontmatterDates, this.settings.noteFormat);
    this.foldProperties?.updateSettings(this.settings.foldProperties);
    this.vaultReplace?.updateSettings(this.settings.vaultReplace);
    this.stickyViewMode?.updateSettings(this.settings.stickyViewMode);
    this.readingFolds?.updateSettings(this.settings.readingFolds);
  }
}
