import { Notice, Plugin } from "obsidian";
import { enableNoAutoFocus, disableNoAutoFocus } from "./modules/no-auto-focus";
import { FontLoader, FontSettings, DEFAULT_FONT_SETTINGS } from "./modules/font-loader";
import { PluginHttpServer } from "./server/http-server";
import { createHandler, RouteContext } from "./server/routes";
import { EmbeddingEngine } from "./embedding/engine";
import { LocalEmbeddingAdapter } from "./embedding/local-adapter";
import { ApiEmbeddingAdapter } from "./embedding/api-adapter";
import { CubicJSettingTab } from "./settings-tab";

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export interface ServerSettings {
  port: number;
  bearerToken: string;
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  port: 27124,
  bearerToken: "",
};

export interface EmbeddingSettings {
  mode: "local" | "api";
  localModel: string;
  apiEndpoint: string;
  apiKey: string;
  apiModel: string;
}

export const DEFAULT_EMBEDDING_SETTINGS: EmbeddingSettings = {
  mode: "local",
  localModel: "Xenova/all-MiniLM-L6-v2",
  apiEndpoint: "https://api.openai.com/v1/embeddings",
  apiKey: "",
  apiModel: "text-embedding-3-small",
};

export interface CubicJSettings {
  font: FontSettings;
  server: ServerSettings;
  embedding: EmbeddingSettings;
}

export const DEFAULT_SETTINGS: CubicJSettings = {
  font: DEFAULT_FONT_SETTINGS,
  server: DEFAULT_SERVER_SETTINGS,
  embedding: DEFAULT_EMBEDDING_SETTINGS,
};

export default class CubicJPlugin extends Plugin {
  settings: CubicJSettings;
  fontLoader: FontLoader;
  httpServer: PluginHttpServer;
  embeddingEngine: EmbeddingEngine | null = null;

  async onload() {
    await this.loadSettings();

    if (!this.settings.server.bearerToken) {
      this.settings.server.bearerToken = generateToken();
      await this.saveSettings();
    }

    enableNoAutoFocus();

    this.fontLoader = new FontLoader(this.app);
    await this.fontLoader.load(this.settings.font);

    this.httpServer = new PluginHttpServer();
    await this.startServer();

    this.initEmbeddingEngine();

    this.addSettingTab(new CubicJSettingTab(this.app, this));
    console.log("CubicJ Plugin Package loaded");
  }

  async onunload() {
    disableNoAutoFocus();
    this.fontLoader?.unload();
    await this.httpServer?.stop();
    await this.embeddingEngine?.unload();
    console.log("CubicJ Plugin Package unloaded");
  }

  async startServer() {
    try {
      const ctx: RouteContext = { app: this.app };
      const handler = createHandler(this.settings.server.bearerToken, ctx);
      await this.httpServer.start(this.settings.server.port, handler);
      console.log(`CubicJ HTTP server listening on port ${this.settings.server.port}`);
    } catch (e) {
      new Notice(`Failed to start HTTP server: ${e}`);
    }
  }

  async initEmbeddingEngine() {
    try {
      const es = this.settings.embedding;
      const adapter =
        es.mode === "local"
          ? new LocalEmbeddingAdapter(es.localModel)
          : new ApiEmbeddingAdapter(es.apiEndpoint, es.apiKey, es.apiModel);

      this.embeddingEngine = new EmbeddingEngine(adapter);
      await this.embeddingEngine.load();
      console.log(`Embedding engine loaded (${es.mode})`);
    } catch (e) {
      console.error("Failed to load embedding engine:", e);
      new Notice(`Embedding engine failed to load: ${e}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    );
    this.settings.font = Object.assign({}, DEFAULT_FONT_SETTINGS, this.settings.font);
    this.settings.server = Object.assign({}, DEFAULT_SERVER_SETTINGS, this.settings.server);
    this.settings.embedding = Object.assign({}, DEFAULT_EMBEDDING_SETTINGS, this.settings.embedding);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
