import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PLUGIN_URL = process.env.PLUGIN_URL || "http://127.0.0.1:27124";
const BEARER_TOKEN = process.env.BEARER_TOKEN || "";

async function pluginFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${PLUGIN_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      "Content-Type": "application/json",
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

const server = new McpServer({
  name: "cubicj-obsidian",
  version: "1.0.0",
});

server.tool(
  "search_semantic",
  "Search vault notes by semantic similarity",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => {
    const result = await pluginFetch("/search/semantic", {
      method: "POST",
      body: JSON.stringify({ query, limit: limit ?? 10 }),
    });
    return textResult(result);
  }
);

server.tool(
  "search_keyword",
  "Search vault notes by keyword",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => {
    const result = await pluginFetch("/search/keyword", {
      method: "POST",
      body: JSON.stringify({ query, limit: limit ?? 20 }),
    });
    return textResult(result);
  }
);

server.tool(
  "list_files",
  "List all markdown files in the vault",
  {},
  async () => {
    const result = await pluginFetch("/vault/files");
    return textResult(result);
  }
);

server.tool(
  "get_file",
  "Get the content of a file",
  { path: z.string() },
  async ({ path }) => {
    const result = await pluginFetch(`/vault/file?path=${encodeURIComponent(path)}`);
    return textResult(result);
  }
);

server.tool(
  "create_file",
  "Create a new file in the vault",
  { path: z.string(), content: z.string().optional() },
  async ({ path, content }) => {
    const result = await pluginFetch("/vault/file", {
      method: "POST",
      body: JSON.stringify({ path, content: content ?? "" }),
    });
    return textResult(result);
  }
);

server.tool(
  "update_file",
  "Update an existing file in the vault",
  { path: z.string(), content: z.string() },
  async ({ path, content }) => {
    const result = await pluginFetch(`/vault/file?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    return textResult(result);
  }
);

server.tool(
  "delete_file",
  "Delete a file from the vault",
  { path: z.string() },
  async ({ path }) => {
    const result = await pluginFetch(`/vault/file?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
    return textResult(result);
  }
);

server.tool(
  "get_active_file",
  "Get the currently active file in Obsidian",
  {},
  async () => {
    const result = await pluginFetch("/vault/active");
    return textResult(result);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
