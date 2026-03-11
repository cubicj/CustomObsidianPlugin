import { App, Notice } from "obsidian";

export interface FontSettings {
  fontFolder: string;
  fontFile: string;
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontFolder: "",
  fontFile: "None",
};

const FONT_BASE64_ID = "cubicj-font-base64";
const FONT_GENERAL_ID = "cubicj-font-general";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getMimeType(ext: string): string {
  switch (ext) {
    case "woff": return "font/woff";
    case "woff2": return "font/woff2";
    case "ttf": return "font/truetype";
    case "otf": return "font/opentype";
    default: return "font";
  }
}

function getDefaultCss(fontFamily: string): string {
  return `:root * {
  --font-default: '${fontFamily}';
  --default-font: '${fontFamily}';
  --font-family-editor: '${fontFamily}';
  --font-monospace-default: '${fontFamily}';
  --font-interface-override: '${fontFamily}';
  --font-text-override: '${fontFamily}';
  --font-monospace-override: '${fontFamily}';
}
`;
}

function applyCss(css: string, id: string) {
  const existing = document.getElementById(id);
  const style = document.createElement("style");
  style.innerHTML = css;
  style.id = id;
  document.head.appendChild(style);
  if (existing) existing.remove();
}

function removeCss(id: string) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export class FontLoader {
  private pluginFolder: string;

  constructor(private app: App) {
    this.pluginFolder = `${app.vault.configDir}/plugins/cubicj-core`;
  }

  async load(settings: FontSettings) {
    const fontFile = settings.fontFile;
    if (!fontFile || fontFile.toLowerCase() === "none") {
      applyCss("", FONT_BASE64_ID);
      applyCss("", FONT_GENERAL_ID);
      return;
    }

    try {
      await this.processFont(fontFile, settings);
    } catch (e) {
      new Notice(String(e));
    }
  }

  unload() {
    removeCss(FONT_BASE64_ID);
    removeCss(FONT_GENERAL_ID);
  }

  private async processFont(fileName: string, settings: FontSettings) {
    const cssCachePath = `${this.pluginFolder}/${fileName.toLowerCase().replace(".", "_")}.css`;

    if (!(await this.app.vault.adapter.exists(cssCachePath))) {
      await this.convertFontToCss(fileName, settings.fontFolder, cssCachePath);
    }

    const content = await this.app.vault.adapter.read(cssCachePath);
    applyCss(content, FONT_BASE64_ID);
    this.applyCssRules(fileName);
  }

  private applyCssRules(fileName: string) {
    const fontFamily = fileName.split(".")[0].toLowerCase();
    const css = getDefaultCss(fontFamily) + `\n* { font-family: '${fontFamily}' !important; }\n`;
    applyCss(css, FONT_GENERAL_ID);
  }

  private async convertFontToCss(fileName: string, fontFolder: string, cssCachePath: string) {
    new Notice("Processing font file...");
    const filePath = `${fontFolder}${fileName}`;
    const arrayBuffer = await this.app.vault.adapter.readBinary(filePath);
    const base64 = arrayBufferToBase64(arrayBuffer);
    const fontFamily = fileName.split(".")[0].toLowerCase();
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const mimeType = getMimeType(ext);

    const fontFaceCss = `@font-face{
  font-family: '${fontFamily}';
  src: url(data:${mimeType};base64,${base64});
}`;

    await this.app.vault.adapter.write(cssCachePath, fontFaceCss);
    console.log("Font CSS saved: %s", cssCachePath);
  }

  async listFonts(fontFolder: string): Promise<string[]> {
    try {
      if (!(await this.app.vault.adapter.exists(fontFolder))) {
        await this.app.vault.adapter.mkdir(fontFolder);
      }
      const listing = await this.app.vault.adapter.list(fontFolder);
      return listing.files
        .map((f) => f.replace(fontFolder, ""))
        .filter((f) => !f.startsWith("."));
    } catch {
      return [];
    }
  }
}
