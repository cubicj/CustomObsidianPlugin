import { Plugin } from "obsidian";
import { enableNoAutoFocus, disableNoAutoFocus } from "./modules/no-auto-focus";
import { FontLoader, FontSettings, DEFAULT_FONT_SETTINGS } from "./modules/font-loader";
import { CubicJSettingTab } from "./settings-tab";

interface CubicJSettings {
  font: FontSettings;
}

const DEFAULT_SETTINGS: CubicJSettings = {
  font: DEFAULT_FONT_SETTINGS,
};

export default class CubicJPlugin extends Plugin {
  settings: CubicJSettings;
  fontLoader: FontLoader;

  async onload() {
    await this.loadSettings();
    enableNoAutoFocus();

    this.fontLoader = new FontLoader(this.app);
    await this.fontLoader.load(this.settings.font);

    this.addSettingTab(new CubicJSettingTab(this.app, this));
    console.log("CubicJ Plugin Package loaded");
  }

  async onunload() {
    disableNoAutoFocus();
    this.fontLoader?.unload();
    console.log("CubicJ Plugin Package unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
