import { Plugin } from "obsidian";
import { enableNoAutoFocus, disableNoAutoFocus } from "./modules/no-auto-focus";
import { FontLoader, FontSettings, DEFAULT_FONT_SETTINGS } from "./modules/font-loader";
import { FrontmatterDateManager } from "./modules/frontmatter-dates";
import { DEFAULT_FRONTMATTER_DATE_SETTINGS } from "./modules/frontmatter-date-utils";
import type { FrontmatterDateSettings } from "./modules/frontmatter-date-utils";
import { CubicJCoreSettingTab } from "./settings-tab";

interface CubicJCoreSettings {
  font: FontSettings;
  frontmatterDates: FrontmatterDateSettings;
}

const DEFAULT_SETTINGS: CubicJCoreSettings = {
  font: DEFAULT_FONT_SETTINGS,
  frontmatterDates: DEFAULT_FRONTMATTER_DATE_SETTINGS,
};

export default class CubicJCorePlugin extends Plugin {
  settings!: CubicJCoreSettings;
  fontLoader!: FontLoader;
  frontmatterDates!: FrontmatterDateManager;

  async onload() {
    await this.loadSettings();
    enableNoAutoFocus();

    this.fontLoader = new FontLoader(this.app);
    await this.fontLoader.load(this.settings.font);

    this.frontmatterDates = new FrontmatterDateManager(this, this.settings.frontmatterDates);
    this.frontmatterDates.register();

    this.addSettingTab(new CubicJCoreSettingTab(this.app, this));
    console.log("CubicJ Core loaded");
  }

  async onunload() {
    disableNoAutoFocus();
    this.fontLoader?.unload();
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
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.frontmatterDates?.updateSettings(this.settings.frontmatterDates);
  }
}
