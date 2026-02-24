import * as http from "http";
import { App, TFile } from "obsidian";

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, message: string, status = 400) {
  sendJson(res, { error: message }, status);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function getQueryParam(url: string, key: string): string | null {
  const idx = url.indexOf("?");
  if (idx === -1) return null;
  const params = new URLSearchParams(url.slice(idx + 1));
  return params.get(key);
}

export interface RouteContext {
  app: App;
  searchSemantic?: (query: string, limit: number) => Promise<Array<{ path: string; score: number }>>;
}

export function createHandler(bearerToken: string, ctx: RouteContext) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
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
        return handleListFiles(ctx, res);
      }
      if (path === "/vault/file" && method === "GET") {
        return handleGetFile(ctx, req, res);
      }
      if (path === "/vault/file" && method === "POST") {
        return handleCreateFile(ctx, req, res);
      }
      if (path === "/vault/file" && method === "PUT") {
        return handleUpdateFile(ctx, req, res);
      }
      if (path === "/vault/file" && method === "DELETE") {
        return handleDeleteFile(ctx, req, res);
      }
      if (path === "/vault/active" && method === "GET") {
        return handleGetActive(ctx, res);
      }
      if (path === "/search/keyword" && method === "POST") {
        return handleSearchKeyword(ctx, req, res);
      }
      if (path === "/search/semantic" && method === "POST") {
        return handleSearchSemantic(ctx, req, res);
      }
      sendError(res, "Not found", 404);
    } catch (e) {
      sendError(res, String(e), 500);
    }
  };
}

function handleListFiles(ctx: RouteContext, res: http.ServerResponse) {
  const files = ctx.app.vault.getMarkdownFiles().map((f) => ({
    path: f.path,
    name: f.name,
    size: f.stat.size,
    mtime: f.stat.mtime,
  }));
  sendJson(res, files);
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
  const body = JSON.parse(await readBody(req));
  const { path: filePath, content } = body;
  if (!filePath) return sendError(res, "Missing path");

  const existing = ctx.app.vault.getAbstractFileByPath(filePath);
  if (existing) return sendError(res, "File already exists", 409);

  const file = await ctx.app.vault.create(filePath, content || "");
  sendJson(res, { path: file.path }, 201);
}

async function handleUpdateFile(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  const filePath = getQueryParam(req.url || "", "path");
  if (!filePath) return sendError(res, "Missing path param");

  const file = ctx.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return sendError(res, "File not found", 404);

  const body = JSON.parse(await readBody(req));
  await ctx.app.vault.modify(file, body.content || "");
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
  const body = JSON.parse(await readBody(req));
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

async function handleSearchSemantic(ctx: RouteContext, req: http.IncomingMessage, res: http.ServerResponse) {
  if (!ctx.searchSemantic) {
    return sendError(res, "Semantic search not available", 503);
  }
  const body = JSON.parse(await readBody(req));
  const { query, limit = 10 } = body;
  if (!query) return sendError(res, "Missing query");

  const results = await ctx.searchSemantic(query, limit);
  sendJson(res, results);
}
