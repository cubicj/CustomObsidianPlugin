import { Notice, Plugin } from "obsidian";
import { enableNoAutoFocus, disableNoAutoFocus } from "./modules/no-auto-focus";
import { FontLoader, FontSettings, DEFAULT_FONT_SETTINGS } from "./modules/font-loader";
import { PluginHttpServer } from "./server/http-server";
import { createHandler, RouteContext } from "./server/routes";
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

export interface CubicJSettings {
  font: FontSettings;
  server: ServerSettings;
}

export const DEFAULT_SETTINGS: CubicJSettings = {
  font: DEFAULT_FONT_SETTINGS,
  server: DEFAULT_SERVER_SETTINGS,
};

export default class CubicJPlugin extends Plugin {
  settings: CubicJSettings;
  fontLoader: FontLoader;
  httpServer: PluginHttpServer;

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

    this.addSettingTab(new CubicJSettingTab(this.app, this));
    console.log("CubicJ Plugin Package loaded");
  }

  async onunload() {
    disableNoAutoFocus();
    this.fontLoader?.unload();
    await this.httpServer?.stop();
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

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    );
    this.settings.font = Object.assign({}, DEFAULT_FONT_SETTINGS, this.settings.font);
    this.settings.server = Object.assign({}, DEFAULT_SERVER_SETTINGS, this.settings.server);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
