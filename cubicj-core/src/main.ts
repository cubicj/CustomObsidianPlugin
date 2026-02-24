import { Plugin } from "obsidian";
import { enableNoAutoFocus, disableNoAutoFocus } from "./modules/no-auto-focus";
import { FontLoader, FontSettings, DEFAULT_FONT_SETTINGS } from "./modules/font-loader";
import { CubicJCoreSettingTab } from "./settings-tab";

interface CubicJCoreSettings {
  font: FontSettings;
}

const DEFAULT_SETTINGS: CubicJCoreSettings = {
  font: DEFAULT_FONT_SETTINGS,
};

export default class CubicJCorePlugin extends Plugin {
  settings: CubicJCoreSettings;
  fontLoader: FontLoader;

  async onload() {
    await this.loadSettings();
    enableNoAutoFocus();

    this.fontLoader = new FontLoader(this.app);
    await this.fontLoader.load(this.settings.font);

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
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
