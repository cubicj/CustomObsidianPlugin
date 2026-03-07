import * as http from "http";
import { App, TFile } from "obsidian";

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, message: string, status = 400) {
  sendJson(res, { error: message }, status);
}

function parseCharset(contentType: string | undefined): string {
  if (!contentType) return "utf-8";
  const match = contentType.match(/charset=([^\s;]+)/i);
  return match ? match[1].toLowerCase() : "utf-8";
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const charset = parseCharset(req.headers["content-type"]);
      try {
        resolve(new TextDecoder(charset).decode(Buffer.concat(chunks)));
      } catch {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });
    req.on("error", reject);
  });
}

function getQueryParam(url: string, key: string): string | null {
  const idx = url.indexOf("?");
  if (idx === -1) return null;
  const params = new URLSearchParams(url.slice(idx + 1));
  return params.get(key);
}

async function safeReadJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export interface RouteContext {
  app: App;
  searchSemantic?: (query: string, limit: number, diversity?: number) => Promise<Array<{ path: string; heading: string; content: string; score: number }>>;
  rerank?: (query: string, documents: string[], topK?: number) => Promise<Array<{ index: number; relevanceScore: number }>>;
  getStatus?: () => { vectorCount: number; model: string | null; dimension: number | null };
  getEmbeddingStats?: () => Promise<{ pendingFiles: number; staleFiles: number; unembeddedFiles: number }>;
  reEmbed?: (path?: string) => Promise<{ processed: number; skipped: number }>;
  reloadPlugin?: () => void;
}

export function createHandler(bearerToken: string, ctx: RouteContext) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const origin = req.headers.origin || "";
    const allowed = origin === "http://127.0.0.1" || origin.startsWith("http://127.0.0.1:");
    res.setHeader("Access-Control-Allow-Origin", allowed ? origin : "http://127.0.0.1");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${bearerToken}`) {
      return sendError(res, "Unauthorized", 401);
    }

    const url = req.url || "/";
    const path = url.split("?")[0];
    const method = req.method || "GET";

    try {
      if (path === "/vault/files" && method === "GET") {
        return await handleListFiles(ctx, res);
      }
      if (path === "/vault/file" && method === "GET") {
        return await handleGetFile(ctx, req, res);
      }
      if (path === "/vault/file" && method === "POST") {
        return await handleCreateFile(ctx, req, res);
      }
      if (path === "/vault/file" && method === "PUT") {
        return await handleUpdateFile(ctx, req, res);
      }
      if (path === "/vault/file" && method === "PATCH") {
        return await handleAppendFile(ctx, req, res);
      }
      if (path === "/vault/file" && method === "DELETE") {
        return await handleDeleteFile(ctx, req, res);
      }
      if (path === "/vault/open" && method === "POST") {
        return await handleOpenFile(ctx, req, res);
      }
      if (path === "/vault/active" && method === "GET") {
        return await handleGetActive(ctx, res);
      }
      if (path === "/search/keyword" && method === "POST") {
        return await handleSearchKeyword(ctx, req, res);
      }
      if (path === "/search" && method === "POST") {
        return await handleSearch(ctx, req, res);
      }
      if (path === "/plugin/reload" && method === "POST") {
        return handleReload(ctx, res);
      }
      if (path === "/embedding/re-embed" && method === "POST") {
        return await handleReEmbed(ctx, req, res);
      }
      if (path === "/brewing/beans" && method === "GET") {
        return await handleGetBeans(ctx, req, res);
      }
      if (path === "/brewing/records" && method === "GET") {
        return await handleGetBrewRecords(ctx, req, res);
      }
      if (path === "/brewing/summary" && method === "GET") {
        return await handleGetBrewSummary(ctx, req, res);
      }
      if (path === "/status" && method === "GET") {
        return await handleStatus(ctx, res);
      }
      sendError(res, "Not found", 404);
    } catch (e) {
      sendError(res, String(e), 500);
    }
  };
}

function handleListFiles(ctx: RouteContext, res: http.ServerResponse) {
  interface DirNode { files: string[]; dirs: Record<string, DirNode>; }
  const root: DirNode = { files: [], dirs: {} };

  for (const file of ctx.app.vault.getMarkdownFiles()) {
    const parts = file.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs[parts[i]]) node.dirs[parts[i]] = { files: [], dirs: {} };
      node = node.dirs[parts[i]];
    }
    node.files.push(parts[parts.length - 1]);
  }

  function toTree(node: DirNode): (string | Record<string, unknown>)[] {
    const result: (string | Record<string, unknown>)[] = [...node.files];
    for (const [name, child] of Object.entries(node.dirs)) {
      result.push({ [name]: toTree(child) });
    }
    return result;
  }

  const output: Record<string, unknown> = {};
  for (const [name, child] of Object.entries(root.dirs)) {
    output[name] = toTree(child);
  }
  if (root.files.length > 0) output["_root"] = root.files;
  sendJson(res, output);
}

async function handleGetFile(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const filePath = getQueryParam(req.url || "", "path");
  if (!filePath) return sendError(res, "Missing path param");

  const file = ctx.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return sendError(res, "File not found", 404);

  const content = await ctx.app.vault.read(file);
  sendJson(res, { path: file.path, content });
}

async function handleCreateFile(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await safeReadJson(req);
  const { path: filePath, content } = body;
  if (!filePath || typeof filePath !== "string") return sendError(res, "Missing path");

  const existing = ctx.app.vault.getAbstractFileByPath(filePath);
  if (existing) return sendError(res, "File already exists", 409);

  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) {
    const parts = dir.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!ctx.app.vault.getAbstractFileByPath(current)) {
        await ctx.app.vault.createFolder(current);
      }
    }
  }

  const file = await ctx.app.vault.create(filePath, typeof content === "string" ? content : "");
  sendJson(res, { path: file.path }, 201);
}

async function handleUpdateFile(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const filePath = getQueryParam(req.url || "", "path");
  if (!filePath) return sendError(res, "Missing path param");

  const file = ctx.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return sendError(res, "File not found", 404);

  const body = await safeReadJson(req);
  if (typeof body.content !== "string") return sendError(res, "Missing content field");
  await ctx.app.vault.modify(file, body.content);
  sendJson(res, { path: file.path });
}

async function handleDeleteFile(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const filePath = getQueryParam(req.url || "", "path");
  if (!filePath) return sendError(res, "Missing path param");

  const file = ctx.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return sendError(res, "File not found", 404);

  await ctx.app.vault.trash(file, true);
  sendJson(res, { deleted: filePath });
}

function handleGetActive(ctx: RouteContext, res: http.ServerResponse) {
  const file = ctx.app.workspace.getActiveFile();
  if (!file) return sendJson(res, { path: null });
  sendJson(res, { path: file.path, name: file.name });
}

async function handleSearchKeyword(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await safeReadJson(req);
  const { query, limit = 20 } = body;
  if (!query) return sendError(res, "Missing query");

  const results: Array<{ path: string; matches: string[] }> = [];
  const files = ctx.app.vault.getMarkdownFiles();
  const lowerQuery = query.toLowerCase();

  for (const file of files) {
    const content = await ctx.app.vault.cachedRead(file);
    if (content.toLowerCase().includes(lowerQuery)) {
      const lines = content.split("\n");
      const matches = lines
        .filter((line) => line.toLowerCase().includes(lowerQuery))
        .slice(0, 5);
      results.push({ path: file.path, matches });
      if (results.length >= limit) break;
    }
  }

  sendJson(res, results);
}

async function handleSearch(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  if (!ctx.searchSemantic) {
    return sendError(res, "Search not available (embedding engine not loaded)", 503);
  }
  const body = await safeReadJson(req);
  const { query, limit = 10, diversity = 0 } = body;
  if (!query || typeof query !== "string") return sendError(res, "Missing query");

  const candidateCount = Math.max((limit as number) * 3, 30);

  const semanticResults = await ctx.searchSemantic(query, candidateCount, diversity as number);

  const keywordResults: Array<{ path: string; heading: string; content: string }> = [];
  const lowerQuery = query.toLowerCase();
  const files = ctx.app.vault.getMarkdownFiles();
  for (const file of files) {
    const fileContent = await ctx.app.vault.cachedRead(file);
    if (!fileContent.toLowerCase().includes(lowerQuery)) continue;
    const lines = fileContent.split("\n");
    const matchLines = lines
      .filter((line) => line.toLowerCase().includes(lowerQuery))
      .slice(0, 3)
      .join("\n");
    keywordResults.push({ path: file.path, heading: "", content: matchLines });
    if (keywordResults.length >= candidateCount) break;
  }

  const RRF_K = 60;
  const rrfScores = new Map<string, { path: string; heading: string; content: string; score: number }>();

  for (let i = 0; i < semanticResults.length; i++) {
    const r = semanticResults[i];
    const key = r.heading ? `${r.path}#${r.heading}` : r.path;
    const existing = rrfScores.get(key);
    const rrfScore = 1 / (RRF_K + i + 1);
    if (existing) {
      existing.score += rrfScore;
    } else {
      rrfScores.set(key, { path: r.path, heading: r.heading, content: r.content, score: rrfScore });
    }
  }

  for (let i = 0; i < keywordResults.length; i++) {
    const r = keywordResults[i];
    const key = r.heading ? `${r.path}#${r.heading}` : r.path;
    const existing = rrfScores.get(key);
    const rrfScore = 1 / (RRF_K + i + 1);
    if (existing) {
      existing.score += rrfScore;
    } else {
      rrfScores.set(key, { path: r.path, heading: r.heading, content: r.content, score: rrfScore });
    }
  }

  let merged = [...rrfScores.values()];
  merged.sort((a, b) => b.score - a.score);

  const rerankCandidates = merged.slice(0, Math.max((limit as number) * 2, 20));

  if (ctx.rerank && rerankCandidates.length > 0) {
    try {
      const docs = rerankCandidates.map((r) => r.content);
      const reranked = await ctx.rerank(query, docs, limit as number);
      const results = reranked.map((rr) => {
        const original = rerankCandidates[rr.index];
        return {
          path: original.path,
          heading: original.heading,
          snippet: original.content.slice(0, 500),
          score: rr.relevanceScore,
        };
      });
      return sendJson(res, results);
    } catch (e) {
      console.error("Reranking failed, falling back to RRF scores:", e);
    }
  }

  const results = rerankCandidates.slice(0, limit as number).map((r) => ({
    path: r.path,
    heading: r.heading,
    snippet: r.content.slice(0, 500),
    score: r.score,
  }));
  sendJson(res, results);
}

async function handleAppendFile(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await safeReadJson(req);
  const { path: filePath, content } = body;
  if (!filePath || typeof filePath !== "string") return sendError(res, "Missing path");
  if (typeof content !== "string") return sendError(res, "Missing content field");

  const file = ctx.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return sendError(res, "File not found", 404);

  await ctx.app.vault.append(file, content);
  sendJson(res, { path: file.path });
}

async function handleOpenFile(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await safeReadJson(req);
  const { path: filePath } = body;
  if (!filePath || typeof filePath !== "string") return sendError(res, "Missing path");

  const file = ctx.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return sendError(res, "File not found", 404);

  await ctx.app.workspace.getLeaf().openFile(file);
  sendJson(res, { path: file.path });
}

function handleReload(ctx: RouteContext, res: http.ServerResponse) {
  if (!ctx.reloadPlugin) return sendError(res, "Reload not available", 503);
  sendJson(res, { ok: true, message: "Plugin will reload momentarily" });
  setTimeout(() => ctx.reloadPlugin!(), 200);
}

async function handleReEmbed(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  if (!ctx.reEmbed) return sendError(res, "Embedding not available", 503);

  const body = await safeReadJson(req).catch(() => ({}));
  const path = typeof (body as any).path === "string" ? (body as any).path : undefined;

  const result = await ctx.reEmbed(path);
  sendJson(res, result);
}

async function handleGetBeans(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const status = getQueryParam(req.url || "", "status") || "all";

  const files = ctx.app.vault.getMarkdownFiles();
  const beans: Array<{
    name: string;
    path: string;
    roaster: string | null;
    status: string | null;
    roastDate: string | null;
    roastDays: number | null;
  }> = [];

  for (const file of files) {
    const fm = ctx.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.type !== "bean") continue;
    if (status !== "all" && fm.status !== status) continue;

    const roastDate = fm.roast_date ?? null;
    const roastDays = roastDate
      ? Math.floor((Date.now() - new Date(roastDate).getTime()) / 86400000)
      : null;

    beans.push({
      name: file.basename,
      path: file.path,
      roaster: fm.roaster ?? null,
      status: fm.status ?? null,
      roastDate,
      roastDays,
    });
  }

  sendJson(res, beans);
}

async function handleGetBrewRecords(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url || "";
  const bean = getQueryParam(url, "bean");
  const method = getQueryParam(url, "method");
  const limitStr = getQueryParam(url, "limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 50;

  const dataPath = "cubicj-brewing/brew-records.json";
  if (!(await ctx.app.vault.adapter.exists(dataPath))) return sendJson(res, []);

  const raw = await ctx.app.vault.adapter.read(dataPath);
  let records: any[] = JSON.parse(raw);

  if (bean) records = records.filter((r) => r.bean === bean);
  if (method) records = records.filter((r) => r.method === method);

  records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  records = records.slice(0, limit);

  sendJson(res, records);
}

async function handleGetBrewSummary(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const bean = getQueryParam(req.url || "", "bean");

  const dataPath = "cubicj-brewing/brew-records.json";
  if (!(await ctx.app.vault.adapter.exists(dataPath))) return sendJson(res, []);

  const raw = await ctx.app.vault.adapter.read(dataPath);
  let records: any[] = JSON.parse(raw);

  if (bean) records = records.filter((r) => r.bean === bean);

  const grouped = new Map<string, any[]>();
  for (const r of records) {
    if (!grouped.has(r.bean)) grouped.set(r.bean, []);
    grouped.get(r.bean)!.push(r);
  }

  const summaries: Array<{
    bean: string;
    totalBrews: number;
    lastBrew: string;
    methods: Record<string, number>;
    avgGrindSize: number | null;
    avgDose: number | null;
    grinders: string[];
  }> = [];

  for (const [beanName, recs] of grouped) {
    const methods: Record<string, number> = {};
    let totalGrind = 0, grindCount = 0;
    let totalDose = 0, doseCount = 0;
    const grinders = new Set<string>();

    for (const r of recs) {
      methods[r.method] = (methods[r.method] || 0) + 1;
      if (r.grindSize != null) { totalGrind += r.grindSize; grindCount++; }
      if (r.dose != null) { totalDose += r.dose; doseCount++; }
      if (r.grinder) grinders.add(r.grinder);
    }

    recs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    summaries.push({
      bean: beanName,
      totalBrews: recs.length,
      lastBrew: recs[0].timestamp,
      methods,
      avgGrindSize: grindCount > 0 ? Math.round((totalGrind / grindCount) * 10) / 10 : null,
      avgDose: doseCount > 0 ? Math.round((totalDose / doseCount) * 10) / 10 : null,
      grinders: [...grinders],
    });
  }

  summaries.sort((a, b) => new Date(b.lastBrew).getTime() - new Date(a.lastBrew).getTime());
  sendJson(res, summaries);
}

async function handleStatus(ctx: RouteContext, res: http.ServerResponse) {
  const fileCount = ctx.app.vault.getMarkdownFiles().length;
  const status = ctx.getStatus?.() ?? { vectorCount: 0, model: null, dimension: null };
  const stats = await ctx.getEmbeddingStats?.() ?? { pendingFiles: 0, staleFiles: 0, unembeddedFiles: 0 };
  sendJson(res, {
    ok: true,
    vault: { fileCount },
    embedding: {
      available: !!ctx.searchSemantic,
      ...status,
      ...stats,
    },
  });
}
