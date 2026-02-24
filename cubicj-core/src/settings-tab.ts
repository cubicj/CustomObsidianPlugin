import { App, PluginSettingTab, Setting } from "obsidian";
import type CubicJCorePlugin from "./main";

export class CubicJCoreSettingTab extends PluginSettingTab {
  plugin: CubicJCorePlugin;

  constructor(app: App, plugin: CubicJCorePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();
    await this.displayFontSection(containerEl);
  }

  private async displayFontSection(containerEl: HTMLElement) {
    containerEl.createEl("h2", { text: "Font Loader" });

    const fontSettings = this.plugin.settings.font;

    if (!fontSettings.fontFolder || fontSettings.fontFolder.trim() === "") {
      fontSettings.fontFolder = `${this.app.vault.configDir}/fonts/`;
    }
    if (!fontSettings.fontFolder.endsWith("/")) {
      fontSettings.fontFolder += "/";
    }

    new Setting(containerEl)
      .setName("Fonts folder")
      .setDesc("Folder to look for your custom fonts")
      .addText((text) => {
        text.setValue(fontSettings.fontFolder).onChange(async (value) => {
          fontSettings.fontFolder = value;
          await this.plugin.saveSettings();
        });
      });

    const fonts = await this.plugin.fontLoader.listFonts(fontSettings.fontFolder);
    const options: Record<string, string> = { None: "None" };
    for (const f of fonts) {
      options[f] = f;
    }

    new Setting(containerEl)
      .setName("Reload fonts")
      .setDesc("Reload fonts from the specified folder")
      .addButton((btn) => {
        btn.setButtonText("Reload").onClick(async () => {
          await this.plugin.saveSettings();
          await this.plugin.fontLoader.load(fontSettings);
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Font")
      .setDesc("Choose a font to apply")
      .addDropdown((dd) => {
        for (const [value, label] of Object.entries(options)) {
          dd.addOption(value, label);
        }
        dd.setValue(fontSettings.fontFile).onChange(async (value) => {
          fontSettings.fontFile = value;
          await this.plugin.saveSettings();
          await this.plugin.fontLoader.load(fontSettings);
          this.display();
        });
      });

  }
}
