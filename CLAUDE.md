# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# All plugins (production)
npm run build

# Individual packages
npm run build:core          # cubicj-core only
npm run build:package       # cubicj-plugin-package only

# Dev mode (watch + sourcemaps)
npm run dev:core
npm run dev:package

# MCP bridge (separate, not in workspaces)
cd mcp-bridge && npm run build    # tsc → dist/
```

Both plugin builds auto-copy `main.js` + `manifest.json` to the vault's `.obsidian/plugins/` directory. After build, reload the plugin in Obsidian to apply changes.

## Architecture

Three independent packages in an npm workspaces monorepo:

```
cubicj-core/              → Obsidian plugin: font loading, auto-focus disable
cubicj-plugin-package/    → Obsidian plugin: embedding engine + HTTP API server
mcp-bridge/               → Standalone MCP stdio server wrapping the HTTP API
```

**Data flow:** Obsidian vault ← `cubicj-plugin-package` (HTTP :27124) ← `mcp-bridge` (stdio) ← Claude

### cubicj-plugin-package (main package)

**Embedding pipeline:** File change → 5s debounce → `chunkMarkdown` (heading-based split) → batch embed via Voyage AI → store in `vectors.json`

**Key patterns:**
- `EmbeddingEngine` uses adapter pattern: `ApiEmbeddingAdapter` (standard) vs `ContextualizedApiAdapter` (contextualized embeddings)
- `EmbeddingPipeline` handles batching (128 items / 85% token budget), retry with exponential backoff, and content-hash dedup
- `VectorStore` persists to `vectors.json` in plugin data dir, keyed by `"path"` or `"path#heading"`
- Model/dimension change triggers automatic vector store clear + re-embed

**HTTP server** (`:27124`, Bearer auth, CORS enabled):
- `GET /status` — vault + embedding status
- `POST /search/semantic` / `POST /search/keyword` — search endpoints
- `GET|POST|PUT|DELETE /vault/file` — CRUD operations
- `GET /vault/files` — tree-structured file listing
- `GET /vault/active` — currently focused file

### mcp-bridge

9 MCP tools mapping 1:1 to HTTP endpoints. Communicates via `PLUGIN_URL` (env) + `BEARER_TOKEN` (env). Uses Zod for parameter validation.

## Code Style

- No code comments. Self-documenting code only.
- No TODOs or placeholders.
- CommonJS format for Obsidian plugins, ESNext for mcp-bridge.
- All external modules (`obsidian`, `electron`, `@codemirror/*`) are esbuild externals.
- UTF-8 charset-aware throughout (request parsing, response headers, TextDecoder fallback).
