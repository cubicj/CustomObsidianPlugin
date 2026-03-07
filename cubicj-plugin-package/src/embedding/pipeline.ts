import { Notice, TFile, Vault } from "obsidian";
import { EmbeddingEngine } from "./engine";
import { VectorStore } from "./vector-store";
import { chunkMarkdown, Chunk } from "./chunker";

const MAX_BATCH_ITEMS = 128;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export function contentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export interface PendingDocument {
  path: string;
  hash: string;
  chunks: Chunk[];
  tokens: number;
}

export function buildBatches(pending: PendingDocument[], maxBatchTokens: number): PendingDocument[][] {
  const batches: PendingDocument[][] = [];
  let current: PendingDocument[] = [];
  let currentTokens = 0;
  let currentChunks = 0;

  for (const doc of pending) {
    const safeLimit = maxBatchTokens * 0.85;
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

export class EmbeddingPipeline {
  private isRunning = false;
  private dirtyPaths: Set<string> = new Set();

  constructor(
    private engine: EmbeddingEngine,
    private store: VectorStore,
    private vault: Vault,
    private maxBatchTokens: number = 120_000
  ) {}

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

    const batches = buildBatches(pending, this.maxBatchTokens);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const vecs = await this.embedBatchWithRetry(batch);
        let vecIdx = 0;
        for (const doc of batch) {
          this.store.deleteByPrefix(doc.path);
          for (const chunk of doc.chunks) {
            this.store.set(chunk.key, vecs[vecIdx++], doc.hash, chunk.content, chunk.heading);
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
        this.store.set(chunks[i].key, vecs[i], hash, chunks[i].content, chunks[i].heading);
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

  markDirty(path: string) {
    this.dirtyPaths.add(path);
  }

  get pendingCount(): number {
    return this.dirtyPaths.size;
  }

  async flushDirty(): Promise<{ processed: number; skipped: number }> {
    if (this.isRunning || this.dirtyPaths.size === 0) return { processed: 0, skipped: 0 };
    this.isRunning = true;

    const paths = [...this.dirtyPaths];
    this.dirtyPaths.clear();

    const pending: PendingDocument[] = [];
    let skipped = 0;

    for (const p of paths) {
      const file = this.vault.getAbstractFileByPath(p);
      if (!(file instanceof TFile) || file.extension !== "md") continue;

      const content = await this.vault.cachedRead(file);
      const hash = contentHash(content);
      if (!this.store.needsUpdateByPrefix(p, hash)) {
        skipped++;
        continue;
      }
      const chunks = chunkMarkdown(p, content);
      pending.push({ path: p, hash, chunks, tokens: estimateTokens(content) });
    }

    const batches = buildBatches(pending, this.maxBatchTokens);
    let processed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const vecs = await this.embedBatchWithRetry(batch);
        let vecIdx = 0;
        for (const doc of batch) {
          this.store.deleteByPrefix(doc.path);
          for (const chunk of doc.chunks) {
            this.store.set(chunk.key, vecs[vecIdx++], doc.hash, chunk.content, chunk.heading);
          }
        }
        processed += batch.length;
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
          new Notice("Embedding aborted: invalid API key");
          this.isRunning = false;
          return { processed, skipped };
        }
        console.error(`Failed to embed batch ${i + 1}/${batches.length}:`, e);
      }
    }

    await this.store.save(this.vault);
    this.isRunning = false;
    if (processed > 0) new Notice(`Embedding: ${processed} files updated, ${skipped} unchanged`);
    return { processed, skipped };
  }

  async getEmbeddingStats(): Promise<{ pendingFiles: number; staleFiles: number; unembeddedFiles: number }> {
    const files = this.vault.getMarkdownFiles();
    let staleFiles = 0;
    let unembeddedFiles = 0;

    for (const file of files) {
      const content = await this.vault.cachedRead(file);
      const hash = contentHash(content);
      const hasVectors = this.store.has(file.path) ||
        [...this.store.entries.keys()].some(k => k.startsWith(file.path + "#"));
      if (!hasVectors) {
        unembeddedFiles++;
      } else if (this.store.needsUpdateByPrefix(file.path, hash)) {
        staleFiles++;
      }
    }

    return { pendingFiles: this.dirtyPaths.size, staleFiles, unembeddedFiles };
  }

  async embedByPrefix(prefix: string): Promise<{ processed: number; skipped: number }> {
    if (this.isRunning) return { processed: 0, skipped: 0 };

    const files = this.vault.getMarkdownFiles().filter(f => f.path.startsWith(prefix));
    if (files.length === 0) return { processed: 0, skipped: 0 };

    this.isRunning = true;
    const pending: PendingDocument[] = [];
    let skipped = 0;

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

    const batches = buildBatches(pending, this.maxBatchTokens);
    let processed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const vecs = await this.embedBatchWithRetry(batch);
        let vecIdx = 0;
        for (const doc of batch) {
          this.store.deleteByPrefix(doc.path);
          for (const chunk of doc.chunks) {
            this.store.set(chunk.key, vecs[vecIdx++], doc.hash, chunk.content, chunk.heading);
          }
        }
        processed += batch.length;
      } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
          new Notice("Embedding aborted: invalid API key");
          break;
        }
        console.error(`Failed to embed batch ${i + 1}/${batches.length}:`, e);
      }
    }

    await this.store.save(this.vault);
    this.isRunning = false;
    return { processed, skipped };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
