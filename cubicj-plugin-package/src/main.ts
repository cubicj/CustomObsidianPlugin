import { Plugin } from "obsidian";

interface CubicJSettings {}

const DEFAULT_SETTINGS: CubicJSettings = {};

export default class CubicJPlugin extends Plugin {
  settings: CubicJSettings;

  async onload() {
    await this.loadSettings();
    console.log("CubicJ Plugin Package loaded");
  }

  async onunload() {
    console.log("CubicJ Plugin Package unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
