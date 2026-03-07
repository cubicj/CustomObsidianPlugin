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

    const endpointText = new Setting(containerEl)
      .setName("API endpoint")
      .setDesc("Embedding API endpoint (auto-set by model selection)")
      .addText((text) => {
        text.inputEl.style.width = "250px";
        text.setValue(es.apiEndpoint).onChange(async (value) => {
          es.apiEndpoint = value;
          await this.plugin.saveSettings();
        });
      });

    const models: Record<string, { endpoint: string; label: string }> = {
      "voyage-context-3": {
        endpoint: "https://api.voyageai.com/v1/contextualizedembeddings",
        label: "voyage-context-3 (contextualized)",
      },
      "voyage-4-large": {
        endpoint: "https://api.voyageai.com/v1/embeddings",
        label: "voyage-4-large",
      },
      "voyage-3-large": {
        endpoint: "https://api.voyageai.com/v1/embeddings",
        label: "voyage-3-large",
      },
      "voyage-3-lite": {
        endpoint: "https://api.voyageai.com/v1/embeddings",
        label: "voyage-3-lite",
      },
    };

    new Setting(containerEl)
      .setName("API model")
      .setDesc("Model ID to use for embeddings")
      .addDropdown((dd) => {
        for (const [id, info] of Object.entries(models)) {
          dd.addOption(id, info.label);
        }
        dd.setValue(es.apiModel);
        dd.onChange(async (value) => {
          es.apiModel = value;
          const info = models[value];
          if (info) {
            es.apiEndpoint = info.endpoint;
            const epInput = endpointText.controlEl.querySelector("input");
            if (epInput) (epInput as HTMLInputElement).value = info.endpoint;
          }
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Output dimension")
      .setDesc("Embedding vector dimension (changing this resets all vectors)")
      .addDropdown((dd) => {
        const dims = ["256", "512", "1024", "2048"];
        for (const d of dims) dd.addOption(d, d);
        dd.setValue(String(es.outputDimension));
        dd.onChange(async (value) => {
          es.outputDimension = parseInt(value, 10);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Reranker model")
      .setDesc("Reranks search results for better precision. 'none' disables reranking.")
      .addDropdown((dd) => {
        dd.addOption("rerank-2.5", "rerank-2.5");
        dd.addOption("rerank-2.5-lite", "rerank-2.5-lite");
        dd.addOption("none", "None (disabled)");
        dd.setValue(es.rerankerModel);
        dd.onChange(async (value) => {
          es.rerankerModel = value;
          await this.plugin.saveSettings();
        });
      });
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
          btn.setButtonText("Running...");
          btn.setDisabled(true);
          await this.plugin.initEmbeddingEngine();
          if (this.plugin.pipeline) {
            await this.plugin.pipeline.embedAll();
          }
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Reset embeddings")
      .setDesc("Clear all stored vectors and re-embed from scratch")
      .addButton((btn) => {
        btn.setButtonText("Reset").setWarning().onClick(async () => {
          btn.setButtonText("Resetting...");
          btn.setDisabled(true);
          this.plugin.vectorStore.clear();
          await this.plugin.vectorStore.save(this.app.vault);
          await this.plugin.initEmbeddingEngine();
          if (this.plugin.pipeline) {
            await this.plugin.pipeline.embedAll();
          }
          this.display();
        });
      });
  }
}
