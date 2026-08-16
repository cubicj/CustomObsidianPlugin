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
import {
  DEFAULT_FOLD_REMAP_SETTINGS,
  FoldRemapManager,
} from "./modules/fold-remap";
import type { FoldRemapSettings } from "./modules/fold-remap";
import {
  DEFAULT_READING_BRACKETS_SETTINGS,
  ReadingBracketsManager,
} from "./modules/reading-brackets";
import type { ReadingBracketsSettings } from "./modules/reading-brackets";
import { ReadingListBlankLinesManager } from "./modules/reading-list-blank-lines";
import {
  createNoAltMultiCursorExtension,
  DEFAULT_NO_ALT_MULTI_CURSOR_SETTINGS,
} from "./modules/no-alt-multi-cursor";
import type { NoAltMultiCursorSettings } from "./modules/no-alt-multi-cursor";
import {
  DEFAULT_SIDEBAR_COMMANDS_SETTINGS,
  SidebarCommandsManager,
} from "./modules/sidebar-commands";
import type { SidebarCommandsSettings } from "./modules/sidebar-commands";
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
  foldRemap: FoldRemapSettings;
  readingBrackets: ReadingBracketsSettings;
  noAltMultiCursor: NoAltMultiCursorSettings;
  sidebarCommands: SidebarCommandsSettings;
}

function createDefaultSettings(configDir: string): CubicJCoreSettings {
  const normalizedConfigDir = configDir.endsWith("/") ? configDir : `${configDir}/`;
  return {
    font: DEFAULT_FONT_SETTINGS,
    frontmatterDates: {
      ...DEFAULT_FRONTMATTER_DATE_SETTINGS,
      excludedPaths: [
        normalizedConfigDir,
        ...DEFAULT_FRONTMATTER_DATE_SETTINGS.excludedPaths,
      ],
    },
    noteFormat: DEFAULT_NOTE_FORMAT_SETTINGS,
    eagerParse: DEFAULT_EAGER_PARSE_SETTINGS,
    foldProperties: DEFAULT_FOLD_PROPERTIES_SETTINGS,
    vaultReplace: DEFAULT_VAULT_REPLACE_SETTINGS,
    stickyViewMode: DEFAULT_STICKY_VIEW_MODE_SETTINGS,
    readingFolds: DEFAULT_READING_FOLDS_SETTINGS,
    foldRemap: DEFAULT_FOLD_REMAP_SETTINGS,
    readingBrackets: DEFAULT_READING_BRACKETS_SETTINGS,
    noAltMultiCursor: DEFAULT_NO_ALT_MULTI_CURSOR_SETTINGS,
    sidebarCommands: DEFAULT_SIDEBAR_COMMANDS_SETTINGS,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default class CubicJCorePlugin extends Plugin {
  declare settings: CubicJCoreSettings;
  fontLoader!: FontLoader;
  frontmatterDates!: FrontmatterDateManager;
  foldProperties!: FoldPropertiesManager;
  vaultReplace!: VaultReplaceManager;
  stickyViewMode!: StickyViewModeManager;
  readingFolds!: ReadingFoldsManager;
  foldRemap!: FoldRemapManager;
  readingBrackets!: ReadingBracketsManager;
  readingListBlankLines!: ReadingListBlankLinesManager;
  sidebarCommands!: SidebarCommandsManager;

  async onload() {
    await this.loadSettings();
    enableNoAutoFocus();
    this.register(disableNoAutoFocus);

    this.fontLoader = new FontLoader(this.app);
    this.register(() => this.fontLoader.unload());
    await this.fontLoader.load(this.settings.font);

    this.frontmatterDates = new FrontmatterDateManager(
      this,
      () => this.settings.frontmatterDates,
      () => this.settings.noteFormat,
    );
    this.frontmatterDates.register();

    this.foldProperties = new FoldPropertiesManager(this, () => this.settings.foldProperties);
    this.foldProperties.register();

    this.vaultReplace = new VaultReplaceManager(this, () => this.settings.vaultReplace);
    this.vaultReplace.register();

    this.stickyViewMode = new StickyViewModeManager(this, () => this.settings.stickyViewMode);
    this.stickyViewMode.register();

    this.readingFolds = new ReadingFoldsManager(this, () => this.settings.readingFolds);
    this.readingFolds.register();

    this.foldRemap = new FoldRemapManager(this, () => this.settings.foldRemap);
    this.foldRemap.register();

    this.readingBrackets = new ReadingBracketsManager(this, () => this.settings.readingBrackets);
    this.readingBrackets.register();

    this.readingListBlankLines = new ReadingListBlankLinesManager(this);
    this.readingListBlankLines.register();

    this.sidebarCommands = new SidebarCommandsManager(this, () => this.settings.sidebarCommands);
    this.sidebarCommands.register();

    this.registerEditorExtension(createHeadingEnterExtension(() => this.settings.noteFormat));
    this.registerEditorExtension(createEagerParseExtension(() => this.settings.eagerParse));
    this.registerEditorExtension(
      createNoAltMultiCursorExtension(() => this.settings.noAltMultiCursor),
    );
    this.addSettingTab(new CubicJCoreSettingTab(this.app, this));
  }

  onunload() {
    void this.frontmatterDates?.flushPendingModifiedWrite().catch((error) => {
      console.warn("CubicJ Core failed to flush pending frontmatter date", error);
    });
  }

  async loadSettings() {
    const loaded: unknown = await this.loadData();
    const data = isRecord(loaded) ? loaded : null;
    const defaults = createDefaultSettings(this.app.vault.configDir);
    this.settings = Object.assign({}, defaults, data);
    const settings = this.settings as unknown as Record<string, Record<string, unknown>>;
    const defaultSettings = defaults as unknown as Record<
      string,
      Record<string, unknown>
    >;
    for (const [key, defaults] of Object.entries(defaultSettings)) {
      settings[key] = Object.assign({}, defaults, settings[key]);
    }
    const normalizedConfigDir = this.app.vault.configDir.endsWith("/")
      ? this.app.vault.configDir
      : `${this.app.vault.configDir}/`;
    if (!this.settings.frontmatterDates.excludedPaths.includes(normalizedConfigDir)) {
      this.settings.frontmatterDates.excludedPaths.unshift(normalizedConfigDir);
    }
    const legacyDates = data?.frontmatterDates as { normalizeTrailingNewline?: unknown } | undefined;
    if (data?.noteFormat === undefined && typeof legacyDates?.normalizeTrailingNewline === "boolean") {
      this.settings.noteFormat.normalizeTrailingNewline = legacyDates.normalizeTrailingNewline;
    }
    delete (this.settings.frontmatterDates as { normalizeTrailingNewline?: boolean })
      .normalizeTrailingNewline;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
