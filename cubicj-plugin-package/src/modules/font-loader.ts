import { App, Notice, Vault } from "obsidian";

export interface FontSettings {
  fontFolder: string;
  fontFile: string;
  forceMode: boolean;
  customCssMode: boolean;
  customCss: string;
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontFolder: "",
  fontFile: "None",
  forceMode: false,
  customCssMode: false,
  customCss: "",
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

function applyCss(css: string, id: string, appendMode = false) {
  const existing = document.getElementById(id);
  if (existing && appendMode) {
    existing.innerHTML += css;
  } else {
    const style = document.createElement("style");
    style.innerHTML = css;
    document.head.appendChild(style);
    if (existing) existing.remove();
    style.id = id;
  }
}

function removeCss(id: string) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export class FontLoader {
  private pluginFolder: string;

  constructor(private app: App) {
    this.pluginFolder = `${app.vault.configDir}/plugins/cubicj-plugin-package`;
  }

  async load(settings: FontSettings) {
    const fontFile = settings.fontFile;
    if (!fontFile || fontFile.toLowerCase() === "none") {
      applyCss("", FONT_BASE64_ID);
      applyCss("", FONT_GENERAL_ID);
      return;
    }

    try {
      if (fontFile === "all") {
        applyCss("", FONT_BASE64_ID);
        const folder = settings.fontFolder;
        const listing = await this.app.vault.adapter.list(folder);
        for (const file of listing.files) {
          const name = file.replace(folder, "");
          if (!name.startsWith(".")) {
            await this.processFont(name, settings, true);
          }
        }
      } else {
        await this.processFont(fontFile, settings, false);
      }
    } catch (e) {
      new Notice(String(e));
    }
  }

  unload() {
    removeCss(FONT_BASE64_ID);
    removeCss(FONT_GENERAL_ID);
  }

  private async processFont(fileName: string, settings: FontSettings, appendMode: boolean) {
    const cssCachePath = `${this.pluginFolder}/${fileName.toLowerCase().replace(".", "_")}.css`;

    if (!(await this.app.vault.adapter.exists(cssCachePath))) {
      await this.convertFontToCss(fileName, settings.fontFolder, cssCachePath);
    }

    const content = await this.app.vault.adapter.read(cssCachePath);
    applyCss(content, FONT_BASE64_ID, appendMode);
    this.applyCssRules(fileName, settings);
  }

  private applyCssRules(fileName: string, settings: FontSettings) {
    const fontFamily = fileName.split(".")[0].toLowerCase();
    let css = "";

    if (settings.customCssMode) {
      css = settings.customCss;
    } else {
      css = getDefaultCss(fontFamily);
    }

    if (settings.forceMode) {
      css += `\n* { font-family: '${fontFamily}' !important; }\n`;
    }

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
