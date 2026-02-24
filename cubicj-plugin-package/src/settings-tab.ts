import { App, PluginSettingTab, Setting } from "obsidian";
import type CubicJPlugin from "./main";

export class CubicJSettingTab extends PluginSettingTab {
  plugin: CubicJPlugin;

  constructor(app: App, plugin: CubicJPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();

    this.displayServerSection(containerEl);
  }

  private displayServerSection(containerEl: HTMLElement) {
    containerEl.createEl("h2", { text: "HTTP Server" });

    const serverSettings = this.plugin.settings.server;

    new Setting(containerEl)
      .setName("Port")
      .setDesc("HTTP server port (requires restart)")
      .addText((text) => {
        text.setValue(String(serverSettings.port)).onChange(async (value) => {
          const port = parseInt(value, 10);
          if (!isNaN(port) && port > 0 && port < 65536) {
            serverSettings.port = port;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("Bearer token")
      .setDesc("Authentication token for API access")
      .addText((text) => {
        text.setValue(serverSettings.bearerToken);
        text.inputEl.style.width = "250px";
        text.setDisabled(true);
      })
      .addButton((btn) => {
        btn.setButtonText("Copy").onClick(() => {
          navigator.clipboard.writeText(serverSettings.bearerToken);
          btn.setButtonText("Copied!");
          setTimeout(() => btn.setButtonText("Copy"), 1500);
        });
      });
  }
}
