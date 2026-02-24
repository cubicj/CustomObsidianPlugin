import { Notice, TFile, Vault, debounce } from "obsidian";
import { EmbeddingEngine } from "./engine";
import { VectorStore } from "./vector-store";
import { chunkMarkdown, Chunk } from "./chunker";

const MAX_BATCH_ITEMS = 128;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function contentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

interface PendingDocument {
  path: string;
  hash: string;
  chunks: Chunk[];
  tokens: number;
}

export class EmbeddingPipeline {
  private isRunning = false;

  constructor(
    private engine: EmbeddingEngine,
    private store: VectorStore,
    private vault: Vault,
    private maxBatchTokens: number = 120_000
  ) {}

  private buildBatches(pending: PendingDocument[]): PendingDocument[][] {
    const batches: PendingDocument[][] = [];
    let current: PendingDocument[] = [];
    let currentTokens = 0;
    let currentChunks = 0;

    for (const doc of pending) {
      const safeLimit = this.maxBatchTokens * 0.85;
      const wouldExceedTokens = currentTokens + doc.tokens > safeLimit;
      const wouldExceedItems = current.length >= MAX_BATCH_ITEMS;
      const wouldExceedChunks = currentChunks + doc.chunks.length > 16000;

      if (current.length > 0 && (wouldExceedTokens || wouldExceedItems || wouldExceedChunks)) {
        batches.push(current);
        current = [];
        currentTokens = 0;
        currentChunks = 0;
      }

      current.push(doc);
      currentTokens += doc.tokens;
      currentChunks += doc.chunks.length;
    }

    if (current.length > 0) batches.push(current);
    return batches;
  }

  private async embedBatchWithRetry(batch: PendingDocument[]): Promise<number[][]> {
    const inputs = batch.map((doc) => doc.chunks.map((c) => c.content));
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.engine.embedChunkedDocuments(inputs);
      } catch (e: any) {
        const status = e?.status ?? 0;
        const msg = e?.message ?? "";

        if (status === 401 || status === 403 || msg.includes("Unauthorized")) {
          throw e;
        }

        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt === MAX_RETRIES) throw e;

        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`Embedding batch retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms (status: ${status})`);
        await sleep(delay);
      }
    }
    throw new Error("Unreachable");
  }

  async embedAll(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const files = this.vault.getMarkdownFiles();
    let processed = 0;
    let skipped = 0;

    new Notice(`Embedding: starting (${files.length} files)`);

    const pending: PendingDocument[] = [];
    for (const file of files) {
      const content = await this.vault.cachedRead(file);
      const hash = contentHash(content);
      if (!this.store.needsUpdateByPrefix(file.path, hash)) {
        skipped++;
        continue;
      }
      const chunks = chunkMarkdown(file.path, content);
      pending.push({ path: file.path, hash, chunks, tokens: estimateTokens(content) });
    }

    const batches = this.buildBatches(pending);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const vecs = await this.embedBatchWithRetry(batch);
        let vecIdx = 0;
        for (const doc of batch) {
          this.store.deleteByPrefix(doc.path);
          for (const chunk of doc.chunks) {
            this.store.set(chunk.key, vecs[vecIdx++], doc.hash);
          }
        }
        processed += batch.length;
        new Notice(`Embedding: ${processed}/${pending.length} files processed...`);
        await this.store.save(this.vault);
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
          new Notice("Embedding aborted: invalid API key");
          this.isRunning = false;
          return;
        }
        console.error(`Failed to embed batch ${i + 1}/${batches.length}:`, e);
      }
    }

    await this.store.save(this.vault);
    this.isRunning = false;
    new Notice(`Embedding complete: ${processed} files new, ${skipped} unchanged`);
  }

  async embedFile(file: TFile): Promise<void> {
    try {
      const content = await this.vault.cachedRead(file);
      const hash = contentHash(content);
      if (!this.store.needsUpdateByPrefix(file.path, hash)) return;

      const chunks = chunkMarkdown(file.path, content);
      const inputs = [chunks.map((c) => c.content)];
      const vecs = await this.engine.embedChunkedDocuments(inputs);

      this.store.deleteByPrefix(file.path);
      for (let i = 0; i < chunks.length; i++) {
        this.store.set(chunks[i].key, vecs[i], hash);
      }
      await this.store.save(this.vault);
    } catch (e) {
      console.error(`Failed to embed ${file.path}:`, e);
    }
  }

  removeFile(path: string) {
    this.store.deleteByPrefix(path);
    this.store.save(this.vault);
  }

  createDebouncedEmbed() {
    return debounce((file: TFile) => {
      this.embedFile(file);
    }, 5000, true);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
