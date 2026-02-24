import { EmbeddingAdapter } from "./engine";

export class LocalEmbeddingAdapter implements EmbeddingAdapter {
  private pipeline: any = null;
  private modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async load(): Promise<void> {
    const { pipeline } = await import("@huggingface/transformers");
    this.pipeline = await pipeline("feature-extraction", this.modelId, {
      dtype: "fp32",
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) throw new Error("Model not loaded");

    const results: number[][] = [];
    for (const text of texts) {
      const output = await this.pipeline(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data as Float32Array));
    }
    return results;
  }

  async unload(): Promise<void> {
    if (this.pipeline) {
      await this.pipeline.dispose?.();
      this.pipeline = null;
    }
  }
}
