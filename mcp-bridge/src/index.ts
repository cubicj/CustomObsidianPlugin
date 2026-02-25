import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

process.stdout.on("error", () => {});

const PLUGIN_URL = process.env.PLUGIN_URL || "http://127.0.0.1:27124";
const BEARER_TOKEN = process.env.BEARER_TOKEN || "";

async function pluginFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${PLUGIN_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plugin API error ${res.status}: ${text}`);
  }
  return res.json();
}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

const server = new McpServer({
  name: "cubicj-obsidian",
  version: "1.0.0",
});

server.tool(
  "vault_status",
  "Get the current status of the Obsidian vault and embedding engine. " +
    "Returns vault file count, embedding availability, vector count, model name, and dimension. " +
    "Also returns pendingFiles (dirty queue), staleFiles (hash mismatch), and unembeddedFiles (no vectors). " +
    "Call this first to verify the plugin is running and check embedding coverage before searching.",
  {},
  async () => {
    try {
      return textResult(await pluginFetch("/status"));
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "search_semantic",
  "Search vault notes by semantic similarity using Voyage AI embeddings. " +
    "Finds contextually related content even without exact keyword matches. " +
    "Returns [{path, score}] sorted by relevance (score 0-1, higher is better). " +
    "Requires embedding engine to be running (check vault_status). " +
    "Best for concept/topic searches. For exact text matching, use search_keyword instead.",
  {
    query: z.string().describe("Natural language search query (Korean or English)"),
    limit: z.number().int().min(1).max(50).optional().describe("Max results to return (default: 10, max: 50)"),
  },
  async ({ query, limit }) => {
    try {
      const result = await pluginFetch("/search/semantic", {
        method: "POST",
        body: JSON.stringify({ query, limit: limit ?? 10 }),
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "search_keyword",
  "Search vault notes by case-insensitive keyword matching. " +
    "Returns [{path, matches[]}] where matches are up to 5 matching lines per file. " +
    "Fast and precise for finding notes containing specific words, names, or phrases. " +
    "For conceptual/semantic searches, use search_semantic instead.",
  {
    query: z.string().describe("Keyword or phrase to search for (case-insensitive substring match)"),
    limit: z.number().int().min(1).max(100).optional().describe("Max files to return (default: 20, max: 100)"),
  },
  async ({ query, limit }) => {
    try {
      const result = await pluginFetch("/search/keyword", {
        method: "POST",
        body: JSON.stringify({ query, limit: limit ?? 20 }),
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "list_files",
  "List all markdown files in the Obsidian vault as a tree structure. " +
    "Returns nested JSON where top-level keys are folders, each containing an array. " +
    "Strings in the array are files, objects with a single key are subfolders. " +
    "Use to discover available notes and vault organization before reading or searching.",
  {},
  async () => {
    try {
      return textResult(await pluginFetch("/vault/files"));
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "get_file",
  "Read the full content of a markdown file. " +
    "Returns {path, content} where content is raw markdown text. " +
    "Use after searching to read the full note, or when you know the exact file path.",
  {
    path: z.string().describe("Vault-relative file path (e.g. '2. Hubs/커피.md')"),
  },
  async ({ path }) => {
    try {
      return textResult(await pluginFetch(`/vault/file?path=${encodeURIComponent(path)}`));
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "create_file",
  "Create a new markdown file in the vault. " +
    "Parent directories are created automatically. " +
    "Returns {path} of the created file. Fails with 409 if the file already exists.",
  {
    path: z.string().describe("Vault-relative path for the new file (e.g. '3. Resources/new-note.md')"),
    content: z.string().optional().describe("Initial markdown content (default: empty)"),
  },
  async ({ path, content }) => {
    try {
      const result = await pluginFetch("/vault/file", {
        method: "POST",
        body: JSON.stringify({ path, content: content ?? "" }),
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "update_file",
  "Overwrite the entire content of an existing file. " +
    "Returns {path} on success. Fails with 404 if file doesn't exist. " +
    "WARNING: Replaces all content — read the file first if you need to preserve parts.",
  {
    path: z.string().describe("Vault-relative path of the file to update"),
    content: z.string().describe("New complete markdown content (replaces everything)"),
  },
  async ({ path, content }) => {
    try {
      const result = await pluginFetch(`/vault/file?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "delete_file",
  "Move a file to the Obsidian trash (.trash folder). " +
    "Returns {deleted: path} on success. Fails with 404 if file doesn't exist. " +
    "Soft delete — recoverable from Obsidian's trash.",
  {
    path: z.string().describe("Vault-relative path of the file to delete"),
  },
  async ({ path }) => {
    try {
      const result = await pluginFetch(`/vault/file?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "get_active_file",
  "Get the file currently open and focused in Obsidian. " +
    "Returns {path, name} if a file is active, or {path: null} if nothing is open. " +
    "Useful for context-aware operations on what the user is currently editing.",
  {},
  async () => {
    try {
      return textResult(await pluginFetch("/vault/active"));
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "re_embed",
  "Trigger re-embedding of vault notes. " +
    "Without path: flushes all pending dirty files (modified since last embed). " +
    "With path to a file: re-embeds that specific file. " +
    "With path to a folder: re-embeds all markdown files under that folder. " +
    "Uses content-hash dedup so unchanged files are skipped. " +
    "Returns {processed, skipped} counts. " +
    "Check vault_status first to see pendingFiles/staleFiles/unembeddedFiles counts.",
  {
    path: z.string().optional().describe("Optional vault-relative file or folder path to re-embed. Omit to flush all pending changes."),
  },
  async ({ path }) => {
    try {
      const result = await pluginFetch("/embedding/re-embed", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "append_to_file",
  "Append content to the end of an existing file. " +
    "Unlike update_file, this preserves existing content and adds new text at the end. " +
    "Useful for adding entries to daily notes, logs, or inbox files without reading first. " +
    "Returns {path} on success. Fails with 404 if file doesn't exist.",
  {
    path: z.string().describe("Vault-relative path of the file to append to"),
    content: z.string().describe("Content to append at the end of the file"),
  },
  async ({ path, content }) => {
    try {
      const result = await pluginFetch("/vault/file", {
        method: "PATCH",
        body: JSON.stringify({ path, content }),
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "open_file",
  "Open a file in the Obsidian editor. " +
    "Navigates the Obsidian UI to display the specified file. " +
    "Useful for directing the user's attention to a specific note after searching or editing.",
  {
    path: z.string().describe("Vault-relative path of the file to open (e.g. '2. Hubs/커피.md')"),
  },
  async ({ path }) => {
    try {
      const result = await pluginFetch("/vault/open", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

server.tool(
  "reload_plugin",
  "Reload the Obsidian plugin (disable then re-enable). " +
    "Useful during development after rebuilding plugin code. " +
    "Returns immediately; the plugin restarts ~200ms later. " +
    "The HTTP server will be briefly unavailable during reload.",
  {},
  async () => {
    try {
      const result = await pluginFetch("/plugin/reload", { method: "POST" });
      return textResult(result);
    } catch (e) {
      return errorResult(e);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
