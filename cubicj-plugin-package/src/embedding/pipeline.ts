import { Notice, TFile, Vault, debounce } from "obsidian";
import { EmbeddingEngine } from "./engine";
import { VectorStore } from "./vector-store";

function contentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export class EmbeddingPipeline {
  private isRunning = false;

  constructor(
    private engine: EmbeddingEngine,
    private store: VectorStore,
    private vault: Vault
  ) {}

  async embedAll(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const files = this.vault.getMarkdownFiles();
    let processed = 0;
    let skipped = 0;

    new Notice(`Embedding: starting (${files.length} files)`);

    for (const file of files) {
      try {
        const content = await this.vault.cachedRead(file);
        const hash = contentHash(content);

        if (!this.store.needsUpdate(file.path, hash)) {
          skipped++;
          continue;
        }

        const vecs = await this.engine.embedTexts([content]);
        this.store.set(file.path, vecs[0], hash);
        processed++;

        if (processed % 50 === 0) {
          new Notice(`Embedding: ${processed} files processed...`);
          await this.store.save(this.vault);
        }
      } catch (e) {
        console.error(`Failed to embed ${file.path}:`, e);
      }
    }

    await this.store.save(this.vault);
    this.isRunning = false;
    new Notice(`Embedding complete: ${processed} new, ${skipped} unchanged`);
  }

  async embedFile(file: TFile): Promise<void> {
    try {
      const content = await this.vault.cachedRead(file);
      const hash = contentHash(content);

      if (!this.store.needsUpdate(file.path, hash)) return;

      const vecs = await this.engine.embedTexts([content]);
      this.store.set(file.path, vecs[0], hash);
      await this.store.save(this.vault);
    } catch (e) {
      console.error(`Failed to embed ${file.path}:`, e);
    }
  }

  removeFile(path: string) {
    this.store.delete(path);
    this.store.save(this.vault);
  }

  createDebouncedEmbed() {
    return debounce((file: TFile) => {
      this.embedFile(file);
    }, 5000, true);
  }
}
