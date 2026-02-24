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
    this.displayEmbeddingSection(containerEl);
    this.displayEmbeddingStatus(containerEl);
  }

  private displayServerSection(containerEl: HTMLElement) {
    containerEl.createEl("h2", { text: "HTTP Server" });

    const serverSettings = this.plugin.settings.server;

    new Setting(containerEl)
      .setName("Port")
      .setDesc("HTTP server port (requires restart)")
      .addText((text) => {
        text.inputEl.style.width = "250px";
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

  private displayEmbeddingSection(containerEl: HTMLElement) {
    containerEl.createEl("h2", { text: "Embedding" });

    const es = this.plugin.settings.embedding;

    new Setting(containerEl)
      .setName("Mode")
      .setDesc("Local model or external API")
      .addDropdown((dd) => {
        dd.addOption("local", "Local (transformers.js)");
        dd.addOption("api", "API (OpenAI-compatible)");
        dd.setValue(es.mode).onChange(async (value) => {
          es.mode = value as "local" | "api";
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (es.mode === "local") {
      new Setting(containerEl)
        .setName("Local model")
        .setDesc("Hugging Face model ID")
        .addText((text) => {
          text.inputEl.style.width = "250px";
          text.setValue(es.localModel).onChange(async (value) => {
            es.localModel = value;
            await this.plugin.saveSettings();
          });
        });
    } else {
      new Setting(containerEl)
        .setName("API endpoint")
        .setDesc("OpenAI-compatible embeddings endpoint")
        .addText((text) => {
          text.inputEl.style.width = "250px";
          text.setValue(es.apiEndpoint).onChange(async (value) => {
            es.apiEndpoint = value;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName("API key")
        .setDesc("Bearer token for the embedding API")
        .addText((text) => {
          text.inputEl.type = "password";
          text.inputEl.style.width = "250px";
          text.setValue(es.apiKey).onChange(async (value) => {
            es.apiKey = value;
            await this.plugin.saveSettings();
          });
        });

      new Setting(containerEl)
        .setName("API model")
        .setDesc("Model ID to use for embeddings")
        .addText((text) => {
          text.inputEl.style.width = "250px";
          text.setValue(es.apiModel).onChange(async (value) => {
            es.apiModel = value;
            await this.plugin.saveSettings();
          });
        });
    }
  }

  private displayEmbeddingStatus(containerEl: HTMLElement) {
    containerEl.createEl("h2", { text: "Embedding Status" });

    const totalFiles = this.app.vault.getMarkdownFiles().length;
    const embeddedFiles = this.plugin.vectorStore?.size ?? 0;

    containerEl.createEl("p", {
      text: `Total notes: ${totalFiles} / Embedded: ${embeddedFiles}`,
    });

    new Setting(containerEl)
      .setName("Re-embed all")
      .setDesc("Re-process all notes (may take a while)")
      .addButton((btn) => {
        btn.setButtonText("Re-embed").onClick(async () => {
          if (this.plugin.pipeline) {
            btn.setButtonText("Running...");
            btn.setDisabled(true);
            await this.plugin.pipeline.embedAll();
            this.display();
          }
        });
      });
  }
}
