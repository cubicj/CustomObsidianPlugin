import { Vault } from "obsidian";
import { cosSim } from "./cos-sim";

interface VectorEntry {
  path: string;
  vec: number[];
  hash: string;
  updated: number;
}

interface StoreData {
  entries: Record<string, VectorEntry>;
}

const STORE_PATH = ".obsidian/plugins/cubicj-plugin-package/vectors.json";

export class VectorStore {
  private entries: Map<string, VectorEntry> = new Map();

  async load(vault: Vault): Promise<void> {
    try {
      if (await vault.adapter.exists(STORE_PATH)) {
        const raw = await vault.adapter.read(STORE_PATH);
        const data: StoreData = JSON.parse(raw);
        this.entries = new Map(Object.entries(data.entries));
      }
    } catch (e) {
      console.error("Failed to load vector store:", e);
      this.entries = new Map();
    }
  }

  async save(vault: Vault): Promise<void> {
    const data: StoreData = {
      entries: Object.fromEntries(this.entries),
    };
    await vault.adapter.write(STORE_PATH, JSON.stringify(data));
  }

  set(path: string, vec: number[], hash: string): void {
    this.entries.set(path, { path, vec, hash, updated: Date.now() });
  }

  delete(path: string): void {
    this.entries.delete(path);
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }

  needsUpdate(path: string, hash: string): boolean {
    const entry = this.entries.get(path);
    if (!entry) return true;
    return entry.hash !== hash;
  }

  get size(): number {
    return this.entries.size;
  }

  search(queryVec: number[], limit: number): Array<{ path: string; score: number }> {
    const results: Array<{ path: string; score: number }> = [];

    for (const entry of this.entries.values()) {
      const score = cosSim(queryVec, entry.vec);
      results.push({ path: entry.path, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
