import { EmbeddingAdapter } from "./engine";

export class ApiEmbeddingAdapter implements EmbeddingAdapter {
  constructor(
    private endpoint: string,
    private apiKey: string,
    private modelId: string
  ) {}

  async load(): Promise<void> {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: this.modelId }),
    });

    if (!res.ok) {
      throw new Error(`Embedding API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.data.map((d: any) => d.embedding);
  }

  async unload(): Promise<void> {}
}
