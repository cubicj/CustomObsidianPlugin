import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDateFrontmatter,
  DeferredModifiedWriteQueue,
  DEFAULT_FRONTMATTER_DATE_SETTINGS,
  formatKstTimestamp,
  processDeferredModifiedWrites,
  shouldDeferModifiedWrite,
  shouldManagePath,
  splitPathList,
} from "./frontmatter-date-utils.ts";

test("formats timestamps with an explicit KST offset", () => {
  assert.equal(formatKstTimestamp(Date.UTC(2026, 5, 27, 8, 45, 0)), "2026-06-27T17:45:00+09:00");
});

test("parses path lists into normalized vault-relative prefixes", () => {
  assert.deepEqual(splitPathList("Templates\nAttached Files\\\n\ncubicj-brewing/"), [
    "Templates/",
    "Attached Files/",
    "cubicj-brewing/",
  ]);
});

test("manages markdown notes in personal note folders", () => {
  assert.equal(shouldManagePath("1. Inbox/example.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), true);
  assert.equal(shouldManagePath("2. Hubs/topic.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), true);
  assert.equal(shouldManagePath("3. Resources/ref.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), true);
  assert.equal(shouldManagePath("4. Daily Note/26-06-27.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), true);
});

test("excludes plugin data, templates, attachments, dot folders, and non-markdown files", () => {
  assert.equal(shouldManagePath("Templates/note.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), false);
  assert.equal(shouldManagePath("Attached Files/image.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), false);
  assert.equal(shouldManagePath("cubicj-brewing/data.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), false);
  assert.equal(shouldManagePath(".obsidian/plugins/cubicj-core/data.md", DEFAULT_FRONTMATTER_DATE_SETTINGS), false);
  assert.equal(shouldManagePath("1. Inbox/example.txt", DEFAULT_FRONTMATTER_DATE_SETTINGS), false);
});

test("fills missing date fields without overwriting existing values", () => {
  const frontmatter = { created: "2026-01-01T00:00:00+09:00" };

  const changed = applyDateFrontmatter(frontmatter, DEFAULT_FRONTMATTER_DATE_SETTINGS, {
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
    overwriteModified: false,
  });

  assert.equal(changed, true);
  assert.equal(frontmatter.created, "2026-01-01T00:00:00+09:00");
  assert.equal(frontmatter.modified, "2026-06-27T17:45:00+09:00");
});

test("overwrites modified when handling a note edit", () => {
  const frontmatter = {
    created: "2026-01-01T00:00:00+09:00",
    modified: "2026-01-02T00:00:00+09:00",
  };

  const changed = applyDateFrontmatter(frontmatter, DEFAULT_FRONTMATTER_DATE_SETTINGS, {
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
    overwriteModified: true,
  });

  assert.equal(changed, true);
  assert.equal(frontmatter.created, "2026-01-01T00:00:00+09:00");
  assert.equal(frontmatter.modified, "2026-06-27T17:45:00+09:00");
});

test("defers modified writes for the active file", () => {
  assert.equal(shouldDeferModifiedWrite("1. Inbox/note.md", new Set(["1. Inbox/note.md"])), true);
  assert.equal(shouldDeferModifiedWrite("1. Inbox/note.md", new Set(["2. Hubs/other.md"])), false);
  assert.equal(shouldDeferModifiedWrite("1. Inbox/note.md", new Set()), false);
});

test("keeps multiple deferred modified writes and releases only closed paths", () => {
  const queue = new DeferredModifiedWriteQueue();
  queue.set({
    path: "1. Inbox/note.md",
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
  });
  queue.set({
    path: "2. Hubs/other.md",
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
  });

  assert.deepEqual(queue.takeReady(new Set(["1. Inbox/note.md"])), [
    {
      path: "2. Hubs/other.md",
      createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
      modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
    },
  ]);
  assert.deepEqual(queue.takeReady(new Set(["1. Inbox/note.md"])), []);
  assert.deepEqual(queue.takeReady(new Set()), [
    {
      path: "1. Inbox/note.md",
      createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
      modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
    },
  ]);
});

test("rekeys a deferred modified write after rename", () => {
  const queue = new DeferredModifiedWriteQueue();
  queue.set({
    path: "1. Inbox/note.md",
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
  });

  queue.rename("1. Inbox/note.md", "2. Hubs/renamed.md");

  assert.deepEqual(queue.drain(), [
    {
      path: "2. Hubs/renamed.md",
      createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
      modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
    },
  ]);
});

test("clears a deferred modified write by path", () => {
  const queue = new DeferredModifiedWriteQueue();
  queue.set({
    path: "1. Inbox/note.md",
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
  });

  queue.clear("1. Inbox/note.md");

  assert.deepEqual(queue.drain(), []);
});

test("drains deferred modified writes once for plugin unload", () => {
  const queue = new DeferredModifiedWriteQueue();
  queue.set({
    path: "1. Inbox/note.md",
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
  });
  queue.set({
    path: "2. Hubs/other.md",
    createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
    modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
  });

  assert.deepEqual(queue.drain(), [
    {
      path: "1. Inbox/note.md",
      createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
      modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
    },
    {
      path: "2. Hubs/other.md",
      createdMs: Date.UTC(2026, 5, 27, 0, 0, 0),
      modifiedMs: Date.UTC(2026, 5, 27, 8, 45, 0),
    },
  ]);
  assert.deepEqual(queue.drain(), []);
});

test("continues a deferred write batch after one write rejects", async () => {
  const writes = [
    { path: "1. Inbox/first.md", createdMs: 1, modifiedMs: 2 },
    { path: "2. Hubs/failing.md", createdMs: 3, modifiedMs: 4 },
    { path: "3. Resources/last.md", createdMs: 5, modifiedMs: 6 },
  ];
  const processed = [];
  const failures = [];
  const failure = new Error("write failed");

  await processDeferredModifiedWrites(
    writes,
    async (write) => {
      processed.push(write.path);
      if (write.path === "2. Hubs/failing.md") throw failure;
    },
    (write, error) => {
      failures.push([write.path, error]);
    },
  );

  assert.deepEqual(processed, ["1. Inbox/first.md", "2. Hubs/failing.md", "3. Resources/last.md"]);
  assert.deepEqual(failures, [["2. Hubs/failing.md", failure]]);
});
