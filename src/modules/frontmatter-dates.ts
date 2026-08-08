import { MarkdownView, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import type { App } from "obsidian";
import {
  applyDateFrontmatter,
  DeferredModifiedWriteQueue,
  processDeferredModifiedWrites,
  shouldDeferModifiedWrite,
  shouldManagePath,
} from "./frontmatter-date-utils";
import type { DateFrontmatterOptions, FrontmatterDateSettings, PendingModifiedWrite } from "./frontmatter-date-utils";
import { formatNoteContent } from "./note-format-utils";
import type { NoteFormatSettings } from "./note-format-utils";

export interface BackfillResult {
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
}

interface ModifiedWriteOwner {
  app: App;
  dateSettings: FrontmatterDateSettings;
  formatSettings: NoteFormatSettings;
}

export class FrontmatterDateManager {
  private localEditPaths = new Set<string>();
  private deferredModifiedWrites = new DeferredModifiedWriteQueue();
  private disposed = false;

  constructor(
    private plugin: Plugin,
    private getSettings: () => FrontmatterDateSettings,
    private getFormatSettings: () => NoteFormatSettings,
  ) {}

  register() {
    this.plugin.register(() => {
      this.disposed = true;
    });
    this.plugin.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      this.plugin.registerEvent(
        this.plugin.app.vault.on("create", (file) => {
          void this.handleCreate(file);
        }),
      );
      this.plugin.registerEvent(
        this.plugin.app.vault.on("modify", (file) => {
          void this.handleModify(file);
        }),
      );
      this.plugin.registerEvent(
        this.plugin.app.vault.on("rename", (file, oldPath) => {
          void this.handleRename(file, oldPath);
        }),
      );
      this.plugin.registerEvent(
        this.plugin.app.vault.on("delete", (file) => {
          this.deferredModifiedWrites.clear(file.path);
          this.localEditPaths.delete(file.path);
        }),
      );
      this.plugin.registerEvent(
        this.plugin.app.workspace.on("editor-change", (editor, info) => {
          if (info.file && editor.hasFocus()) {
            this.localEditPaths.add(info.file.path);
          }
        }),
      );
      this.plugin.registerEvent(
        this.plugin.app.workspace.on("file-open", () => {
          void this.flushReady().catch((error) => {
            console.warn("CubicJ Core failed to flush ready frontmatter dates", error);
          });
        }),
      );
      this.plugin.registerEvent(
        this.plugin.app.workspace.on("layout-change", () => {
          void this.flushReady().catch((error) => {
            console.warn("CubicJ Core failed to flush ready frontmatter dates", error);
          });
        }),
      );
    });
  }

  async backfillAll(): Promise<BackfillResult> {
    const result: BackfillResult = { processed: 0, updated: 0, skipped: 0, failed: 0 };
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (!shouldManagePath(file.path, this.getSettings())) {
        result.skipped++;
        continue;
      }
      result.processed++;
      try {
        const updated = await this.backfillFile(file);
        if (updated) {
          result.updated++;
        } else {
          result.skipped++;
        }
      } catch {
        result.failed++;
      }
    }
    return result;
  }

  async formatAll(): Promise<BackfillResult> {
    const result: BackfillResult = { processed: 0, updated: 0, skipped: 0, failed: 0 };
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (!shouldManagePath(file.path, this.getSettings())) {
        result.skipped++;
        continue;
      }
      result.processed++;
      try {
        const content = await this.plugin.app.vault.read(file);
        if (formatNoteContent(content, this.getFormatSettings()) === null) {
          result.skipped++;
          continue;
        }
        await this.plugin.app.vault.process(
          file,
          (current) => formatNoteContent(current, this.getFormatSettings()) ?? current,
        );
        result.updated++;
      } catch {
        result.failed++;
      }
    }
    return result;
  }

  async backfillFile(file: TFile): Promise<boolean> {
    if (this.hasDateFields(file)) return false;
    return this.processFile(file, {
      createdMs: file.stat.ctime,
      modifiedMs: file.stat.mtime,
      overwriteModified: false,
    });
  }

  async flushPendingModifiedWrite(): Promise<void> {
    const writes = this.deferredModifiedWrites.drain();
    this.disposed = true;
    const owner = this.captureModifiedWriteOwner();
    await processModifiedWriteBatch(owner, writes);
  }

  private async handleCreate(file: TAbstractFile) {
    if (this.disposed) return;
    const settings = this.getSettings();
    if (!settings.enabled || !(file instanceof TFile)) return;
    if (!shouldManagePath(file.path, settings)) return;
    await this.processFile(file, {
      createdMs: file.stat.ctime,
      modifiedMs: file.stat.mtime,
      overwriteModified: false,
    });
  }

  private async handleModify(file: TAbstractFile) {
    if (this.disposed) return;
    const settings = this.getSettings();
    if (!settings.enabled || !(file instanceof TFile)) return;
    if (!shouldManagePath(file.path, settings)) return;
    if (!this.localEditPaths.delete(file.path)) return;
    const modifiedWrite: PendingModifiedWrite = {
      path: file.path,
      createdMs: file.stat.ctime,
      modifiedMs: Date.now(),
    };
    const openPaths = this.collectOpenMarkdownPaths();
    if (shouldDeferModifiedWrite(file.path, openPaths)) {
      this.deferredModifiedWrites.set(modifiedWrite);
      return;
    }
    await this.processModifiedWrite(file, modifiedWrite);
  }

  private async handleRename(file: TAbstractFile, oldPath: string) {
    if (this.disposed) return;
    this.deferredModifiedWrites.rename(oldPath, file.path);
    if (this.localEditPaths.delete(oldPath)) {
      this.localEditPaths.add(file.path);
    }
    const settings = this.getSettings();
    if (!settings.enabled || !(file instanceof TFile)) return;
    if (!shouldManagePath(file.path, settings)) return;
    await this.backfillFile(file);
  }

  private collectOpenMarkdownPaths(): Set<string> {
    const paths = new Set<string>();
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        paths.add(leaf.view.file.path);
      }
    }
    return paths;
  }

  private async flushReady() {
    if (this.disposed) return;
    const owner = this.captureModifiedWriteOwner();
    const writes = this.deferredModifiedWrites.takeReady(this.collectOpenMarkdownPaths());
    await processModifiedWriteBatch(owner, writes);
  }

  private async processModifiedWrite(file: TFile, write: PendingModifiedWrite) {
    await processOwnedModifiedWrite(this.captureModifiedWriteOwner(), file, write);
  }

  private async processFile(file: TFile, options: DateFrontmatterOptions): Promise<boolean> {
    let changed = false;
    try {
      await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        changed = applyDateFrontmatter(frontmatter, this.getSettings(), options);
      });
      return changed;
    } catch (error) {
      new Notice(String(error));
      throw error;
    }
  }

  private hasDateFields(file: TFile): boolean {
    const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return false;
    const settings = this.getSettings();
    return Boolean(frontmatter[settings.createdField] && frontmatter[settings.modifiedField]);
  }

  private captureModifiedWriteOwner(): ModifiedWriteOwner {
    const dateSettings = this.getSettings();
    return {
      app: this.plugin.app,
      dateSettings: {
        ...dateSettings,
        managedFolders: [...dateSettings.managedFolders],
        excludedPaths: [...dateSettings.excludedPaths],
      },
      formatSettings: { ...this.getFormatSettings() },
    };
  }
}

async function processModifiedWriteBatch(
  owner: ModifiedWriteOwner,
  writes: readonly PendingModifiedWrite[],
): Promise<void> {
  await processDeferredModifiedWrites(
    writes,
    async (write) => {
      const file = owner.app.vault.getAbstractFileByPath(write.path);
      if (!(file instanceof TFile)) return;
      if (!owner.dateSettings.enabled || !shouldManagePath(file.path, owner.dateSettings)) return;
      await processOwnedModifiedWrite(owner, file, write);
    },
    (write, error) => {
      console.warn(`CubicJ Core failed deferred frontmatter write for ${write.path}`, error);
    },
  );
}

async function processOwnedModifiedWrite(
  owner: ModifiedWriteOwner,
  file: TFile,
  write: PendingModifiedWrite,
): Promise<void> {
  try {
    await owner.app.fileManager.processFrontMatter(file, (frontmatter) => {
      applyDateFrontmatter(frontmatter, owner.dateSettings, {
        createdMs: write.createdMs,
        modifiedMs: write.modifiedMs,
        overwriteModified: true,
      });
    });
    const content = await owner.app.vault.read(file);
    if (formatNoteContent(content, owner.formatSettings) === null) return;
    await owner.app.vault.process(
      file,
      (current) => formatNoteContent(current, owner.formatSettings) ?? current,
    );
  } catch (error) {
    new Notice(String(error));
    throw error;
  }
}
