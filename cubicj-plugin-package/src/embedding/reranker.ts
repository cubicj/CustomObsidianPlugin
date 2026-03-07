export interface RerankResult {
  index: number;
  relevanceScore: number;
}

export class VoyageReranker {
  constructor(
    private apiKey: string,
    private model: string = "rerank-2.5",
  ) {}

  async rerank(query: string, documents: string[], topK?: number): Promise<RerankResult[]> {
    const body: Record<string, unknown> = {
      query,
      documents,
      model: this.model,
      truncation: true,
    };
    if (topK) body.top_k = topK;

    const res = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Rerank API error: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data.data.map((d: any) => ({
      index: d.index,
      relevanceScore: d.relevance_score,
    }));
  }
}
