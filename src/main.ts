import { Plugin } from "obsidian";
import { enableNoAutoFocus, disableNoAutoFocus } from "./modules/no-auto-focus";
import { FontLoader, FontSettings, DEFAULT_FONT_SETTINGS } from "./modules/font-loader";
import { FrontmatterDateManager } from "./modules/frontmatter-dates";
import { DEFAULT_FRONTMATTER_DATE_SETTINGS } from "./modules/frontmatter-date-utils";
import type { FrontmatterDateSettings } from "./modules/frontmatter-date-utils";
import {
  DEFAULT_FOLD_PROPERTIES_SETTINGS,
  FoldPropertiesManager,
} from "./modules/fold-properties";
import type { FoldPropertiesSettings } from "./modules/fold-properties";
import { CubicJCoreSettingTab } from "./settings-tab";

interface CubicJCoreSettings {
  font: FontSettings;
  frontmatterDates: FrontmatterDateSettings;
  foldProperties: FoldPropertiesSettings;
}

const DEFAULT_SETTINGS: CubicJCoreSettings = {
  font: DEFAULT_FONT_SETTINGS,
  frontmatterDates: DEFAULT_FRONTMATTER_DATE_SETTINGS,
  foldProperties: DEFAULT_FOLD_PROPERTIES_SETTINGS,
};

export default class CubicJCorePlugin extends Plugin {
  settings!: CubicJCoreSettings;
  fontLoader!: FontLoader;
  frontmatterDates!: FrontmatterDateManager;
  foldProperties!: FoldPropertiesManager;

  async onload() {
    await this.loadSettings();
    enableNoAutoFocus();

    this.fontLoader = new FontLoader(this.app);
    await this.fontLoader.load(this.settings.font);

    this.frontmatterDates = new FrontmatterDateManager(this, this.settings.frontmatterDates);
    this.frontmatterDates.register();

    this.foldProperties = new FoldPropertiesManager(this, this.settings.foldProperties);
    this.foldProperties.register();

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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.font = Object.assign({}, DEFAULT_FONT_SETTINGS, this.settings.font);
    this.settings.frontmatterDates = Object.assign(
      {},
      DEFAULT_FRONTMATTER_DATE_SETTINGS,
      this.settings.frontmatterDates,
    );
    this.settings.foldProperties = Object.assign(
      {},
      DEFAULT_FOLD_PROPERTIES_SETTINGS,
      this.settings.foldProperties,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.frontmatterDates?.updateSettings(this.settings.frontmatterDates);
    this.foldProperties?.updateSettings(this.settings.foldProperties);
  }
}
