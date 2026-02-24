import { Notice, Plugin, TFile } from "obsidian";
import { PluginHttpServer } from "./server/http-server";
import { createHandler, RouteContext } from "./server/routes";
import { EmbeddingEngine } from "./embedding/engine";
import { ApiEmbeddingAdapter, ContextualizedApiAdapter } from "./embedding/api-adapter";
import { VectorStore } from "./embedding/vector-store";
import { EmbeddingPipeline } from "./embedding/pipeline";
import { CubicJSettingTab } from "./settings-tab";

function getTokenBudget(model: string): number {
  if (model.includes("lite")) return 1_000_000;
  if (model.includes("large") || model.includes("code") || model.includes("finance") || model.includes("law") || model.includes("context")) return 120_000;
  return 320_000;
}

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
  apiEndpoint: string;
  apiKey: string;
  apiModel: string;
  outputDimension: number;
}

export const DEFAULT_EMBEDDING_SETTINGS: EmbeddingSettings = {
  apiEndpoint: "https://api.voyageai.com/v1/contextualizedembeddings",
  apiKey: "",
  apiModel: "voyage-context-3",
  outputDimension: 1024,
};

export interface CubicJSettings {
  server: ServerSettings;
  embedding: EmbeddingSettings;
}

export const DEFAULT_SETTINGS: CubicJSettings = {
  server: DEFAULT_SERVER_SETTINGS,
  embedding: DEFAULT_EMBEDDING_SETTINGS,
};

export default class CubicJPlugin extends Plugin {
  settings: CubicJSettings;
  httpServer: PluginHttpServer;
  embeddingEngine: EmbeddingEngine | null = null;
  vectorStore: VectorStore;
  pipeline: EmbeddingPipeline | null = null;

  async onload() {
    await this.loadSettings();

    if (!this.settings.server.bearerToken) {
      this.settings.server.bearerToken = generateToken();
      await this.saveSettings();
    }

    this.vectorStore = new VectorStore();
    await this.vectorStore.load(this.app.vault);

    this.httpServer = new PluginHttpServer();

    await this.initEmbeddingEngine();
    await this.startServer();

    this.addSettingTab(new CubicJSettingTab(this.app, this));
    console.log("CubicJ Plugin Package loaded");
  }

  async onunload() {
    await this.httpServer?.stop();
    await this.embeddingEngine?.unload();
    console.log("CubicJ Plugin Package unloaded");
  }

  async startServer() {
    try {
      const ctx: RouteContext = {
        app: this.app,
        searchSemantic: this.embeddingEngine
          ? async (query: string, limit: number) => {
              const vec = await this.embeddingEngine!.embedQuery(query);
              return this.vectorStore.search(vec, limit);
            }
          : undefined,
        getStatus: () => ({
          vectorCount: this.vectorStore.size,
          model: this.vectorStore.getModel(),
          dimension: this.vectorStore.getDimension(),
        }),
      };
      const handler = createHandler(this.settings.server.bearerToken, ctx);
      await this.httpServer.start(this.settings.server.port, handler);
      console.log(`CubicJ HTTP server listening on port ${this.settings.server.port}`);
    } catch (e) {
      new Notice(`Failed to start HTTP server: ${e}`);
    }
  }

  async initEmbeddingEngine() {
    const es = this.settings.embedding;
    if (!es.apiKey) {
      console.log("Embedding skipped: no API key configured");
      return;
    }

    try {
      await this.embeddingEngine?.unload();

      const isContextualized = es.apiEndpoint.includes("contextualizedembeddings");
      const adapter = isContextualized
        ? new ContextualizedApiAdapter(es.apiEndpoint, es.apiKey, es.apiModel, es.outputDimension)
        : new ApiEmbeddingAdapter(es.apiEndpoint, es.apiKey, es.apiModel, es.outputDimension);
      this.embeddingEngine = new EmbeddingEngine(adapter);
      await this.embeddingEngine.load();
      console.log("Embedding engine loaded");

      const tokenBudget = getTokenBudget(es.apiModel);
      this.pipeline = new EmbeddingPipeline(this.embeddingEngine, this.vectorStore, this.app.vault, tokenBudget);

      const dimensionChanged = this.vectorStore.getDimension() !== null
        && this.vectorStore.getDimension() !== es.outputDimension;
      const modelChanged = this.vectorStore.getModel() !== null
        && this.vectorStore.getModel() !== es.apiModel;
      if (dimensionChanged || modelChanged) {
        new Notice("Embedding config changed — clearing vectors for re-embed");
        this.vectorStore.clear();
        await this.vectorStore.save(this.app.vault);
      }
      this.vectorStore.setDimension(es.outputDimension);
      this.vectorStore.setModel(es.apiModel);
      this.registerVaultEvents();
    } catch (e) {
      this.embeddingEngine = null;
      this.pipeline = null;
      console.error("Failed to load embedding engine:", e);
      new Notice(`Embedding engine failed to load: ${e}`);
    }
  }

  private registerVaultEvents() {
    if (!this.pipeline) return;

    const debouncedEmbed = this.pipeline.createDebouncedEmbed();

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          debouncedEmbed(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.pipeline!.removeFile(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.pipeline!.removeFile(oldPath);
        if (file instanceof TFile && file.extension === "md") {
          this.pipeline!.embedFile(file);
        }
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    );
    this.settings.server = Object.assign({}, DEFAULT_SERVER_SETTINGS, this.settings.server);
    this.settings.embedding = Object.assign({}, DEFAULT_EMBEDDING_SETTINGS, this.settings.embedding);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
