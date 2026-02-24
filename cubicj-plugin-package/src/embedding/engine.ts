export type InputType = "document" | "query" | null;

export interface EmbeddingAdapter {
  load(): Promise<void>;
  embed(texts: string[], inputType?: InputType): Promise<number[][]>;
  embedContextualized?(inputs: string[][], inputType?: InputType): Promise<number[][]>;
  unload(): Promise<void>;
}

export class EmbeddingEngine {
  private adapter: EmbeddingAdapter;

  constructor(adapter: EmbeddingAdapter) {
    this.adapter = adapter;
  }

  setAdapter(adapter: EmbeddingAdapter) {
    this.adapter = adapter;
  }

  async load(): Promise<void> {
    await this.adapter.load();
  }

  async unload(): Promise<void> {
    await this.adapter.unload();
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    return this.adapter.embed(texts, "document");
  }

  async embedQuery(query: string): Promise<number[]> {
    const result = await this.adapter.embed([query], "query");
    return result[0];
  }
}
