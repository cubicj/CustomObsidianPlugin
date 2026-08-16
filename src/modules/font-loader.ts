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
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function getMimeType(ext: string): string {
  switch (ext) {
    case "woff": return "font/woff";
    case "woff2": return "font/woff2";
    case "ttf": return "font/ttf";
    case "otf": return "font/otf";
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
  const style = document.head.createEl("style", { attr: { id } });
  style.textContent = css;
  if (existing) existing.remove();
}

function removeCss(id: string) {
  document.getElementById(id)?.remove();
}

function getFontCacheFileName(fileName: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(fileName)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `font-${hash.toString(16).padStart(16, "0")}.css`;
}

export class FontLoader {
  private pluginFolder: string;

  constructor(private app: App) {
    this.pluginFolder = `${app.vault.configDir}/plugins/cubicj-core`;
  }

  async load(settings: FontSettings, options?: { refreshCache?: boolean }) {
    const fontFile = settings.fontFile;
    if (!fontFile || fontFile.toLowerCase() === "none") {
      removeCss(FONT_BASE64_ID);
      removeCss(FONT_GENERAL_ID);
      return;
    }

    try {
      await this.processFont(fontFile, settings, options);
    } catch (e) {
      new Notice(String(e));
    }
  }

  unload() {
    removeCss(FONT_BASE64_ID);
    removeCss(FONT_GENERAL_ID);
  }

  private async processFont(fileName: string, settings: FontSettings, options?: { refreshCache?: boolean }) {
    const cssCachePath = `${this.pluginFolder}/${getFontCacheFileName(fileName)}`;

    if (options?.refreshCache || !(await this.app.vault.adapter.exists(cssCachePath))) {
      await this.convertFontToCss(fileName, this.normalizeFontFolder(settings.fontFolder), cssCachePath);
      const listing = await this.app.vault.adapter.list(this.pluginFolder);
      for (const path of listing.files) {
        if (
          !path.endsWith(".css") ||
          path === cssCachePath ||
          path === `${this.pluginFolder}/styles.css`
        ) {
          continue;
        }
        try {
          await this.app.vault.adapter.remove(path);
        } catch (error) {
          void error;
        }
      }
    }

    const content = await this.app.vault.adapter.read(cssCachePath);
    applyCss(content, FONT_BASE64_ID);
    this.applyCssRules(fileName);
  }

  private applyCssRules(fileName: string) {
    const fontFamily = this.getFontFileParts(fileName).baseName;
    applyCss(getDefaultCss(fontFamily), FONT_GENERAL_ID);
  }

  private async convertFontToCss(fileName: string, fontFolder: string, cssCachePath: string) {
    new Notice("Processing font file...");
    const filePath = `${fontFolder}${fileName}`;
    const arrayBuffer = await this.app.vault.adapter.readBinary(filePath);
    const base64 = arrayBufferToBase64(arrayBuffer);
    const { baseName, extension } = this.getFontFileParts(fileName);
    const mimeType = getMimeType(extension);

    const fontFaceCss = `@font-face{
  font-family: '${baseName}';
  src: url(data:${mimeType};base64,${base64});
}`;

    await this.app.vault.adapter.write(cssCachePath, fontFaceCss);
  }

  async listFonts(fontFolder: string): Promise<string[]> {
    const normalizedFolder = this.normalizeFontFolder(fontFolder);
    try {
      if (!(await this.app.vault.adapter.exists(normalizedFolder))) {
        await this.app.vault.adapter.mkdir(normalizedFolder);
      }
      const listing = await this.app.vault.adapter.list(normalizedFolder);
      return listing.files
        .map((f) => f.startsWith(normalizedFolder) ? f.slice(normalizedFolder.length) : f)
        .filter((f) => !f.startsWith("."));
    } catch {
      return [];
    }
  }

  private normalizeFontFolder(fontFolder: string): string {
    const folder = fontFolder.trim() || `${this.app.vault.configDir}/fonts/`;
    return folder.endsWith("/") ? folder : `${folder}/`;
  }

  private getFontFileParts(fileName: string): { baseName: string; extension: string } {
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot === -1) {
      return { baseName: fileName.toLowerCase(), extension: "" };
    }
    return {
      baseName: fileName.slice(0, lastDot).toLowerCase(),
      extension: fileName.slice(lastDot + 1).toLowerCase(),
    };
  }
}
