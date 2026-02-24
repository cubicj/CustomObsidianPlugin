import { EmbeddingAdapter, InputType } from "./engine";

export class ApiEmbeddingAdapter implements EmbeddingAdapter {
  constructor(
    private endpoint: string,
    private apiKey: string,
    private modelId: string,
    private outputDimension?: number
  ) {}

  async load(): Promise<void> {}

  async embed(texts: string[], inputType?: InputType): Promise<number[][]> {
    const body: Record<string, unknown> = {
      input: texts,
      model: this.modelId,
      truncation: true,
    };
    if (inputType) body.input_type = inputType;
    if (this.outputDimension) body.output_dimension = this.outputDimension;

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const status = res.status;
      const text = await res.text();
      const err = new Error(`Embedding API error: ${status} ${text}`);
      (err as any).status = status;
      throw err;
    }

    const data = await res.json();
    return data.data.map((d: any) => d.embedding);
  }

  async unload(): Promise<void> {}
}

export class ContextualizedApiAdapter implements EmbeddingAdapter {
  constructor(
    private endpoint: string,
    private apiKey: string,
    private modelId: string,
    private outputDimension?: number,
  ) {}

  async load(): Promise<void> {}
  async unload(): Promise<void> {}

  async embed(texts: string[], inputType?: InputType): Promise<number[][]> {
    return this.embedContextualized(texts.map((t) => [t]), inputType);
  }

  async embedContextualized(
    inputs: string[][],
    inputType?: InputType,
  ): Promise<number[][]> {
    const body: Record<string, unknown> = {
      inputs,
      model: this.modelId,
    };
    if (inputType) body.input_type = inputType;
    if (this.outputDimension) body.output_dimension = this.outputDimension;

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const status = res.status;
      const text = await res.text();
      const err = new Error(`Embedding API error: ${status} ${text}`);
      (err as any).status = status;
      throw err;
    }

    const data = await res.json();
    const vecs: number[][] = [];
    for (const outer of data.data) {
      for (const inner of outer.data) {
        vecs.push(inner.embedding);
      }
    }
    return vecs;
  }
}
