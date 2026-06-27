import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import {
  applyDateFrontmatter,
  DeferredModifiedWriteQueue,
  shouldDeferModifiedWrite,
  shouldManagePath,
} from "./frontmatter-date-utils";
import type { DateFrontmatterOptions, FrontmatterDateSettings, PendingModifiedWrite } from "./frontmatter-date-utils";

export interface BackfillResult {
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
}

const PLUGIN_WRITE_GUARD_MS = 2000;

export class FrontmatterDateManager {
  private pluginWritePaths = new Set<string>();
  private deferredModifiedWrites = new DeferredModifiedWriteQueue();
  private plugin: Plugin;
  private settings: FrontmatterDateSettings;

  constructor(plugin: Plugin, settings: FrontmatterDateSettings) {
    this.plugin = plugin;
    this.settings = settings;
  }

  updateSettings(settings: FrontmatterDateSettings) {
    this.settings = settings;
  }

  register() {
    this.plugin.app.workspace.onLayoutReady(() => {
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
        this.plugin.app.workspace.on("file-open", (file) => {
          void this.flushDeferredModifiedWrite(file?.path);
        }),
      );
    });
  }

  async backfillAll(): Promise<BackfillResult> {
    const result: BackfillResult = { processed: 0, updated: 0, skipped: 0, failed: 0 };
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (!shouldManagePath(file.path, this.settings)) {
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

  async backfillFile(file: TFile): Promise<boolean> {
    if (this.hasDateFields(file)) return false;
    return this.processFile(file, {
      createdMs: file.stat.ctime,
      modifiedMs: file.stat.mtime,
      overwriteModified: false,
    });
  }

  async flushPendingModifiedWrite(): Promise<void> {
    const write = this.deferredModifiedWrites.takePending();
    if (!write) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(write.path);
    if (!(file instanceof TFile)) return;
    if (!this.settings.enabled || !shouldManagePath(file.path, this.settings)) return;
    await this.processModifiedWrite(file, write);
  }

  private async handleCreate(file: TAbstractFile) {
    if (!this.settings.enabled || !(file instanceof TFile)) return;
    if (!shouldManagePath(file.path, this.settings)) return;
    await this.processFile(file, {
      createdMs: file.stat.ctime,
      modifiedMs: file.stat.mtime,
      overwriteModified: false,
    });
  }

  private async handleModify(file: TAbstractFile) {
    if (!this.settings.enabled || !(file instanceof TFile)) return;
    if (!shouldManagePath(file.path, this.settings)) return;
    if (this.pluginWritePaths.has(file.path)) {
      this.pluginWritePaths.delete(file.path);
      return;
    }
    const modifiedWrite: PendingModifiedWrite = {
      path: file.path,
      createdMs: file.stat.ctime,
      modifiedMs: Date.now(),
    };
    if (shouldDeferModifiedWrite(file.path, this.plugin.app.workspace.getActiveFile()?.path)) {
      this.deferredModifiedWrites.set(modifiedWrite);
      return;
    }
    await this.processModifiedWrite(file, modifiedWrite);
  }

  private async flushDeferredModifiedWrite(activeFilePath: string | null | undefined) {
    const write = this.deferredModifiedWrites.takeReady(activeFilePath);
    if (!write) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(write.path);
    if (!(file instanceof TFile)) {
      this.deferredModifiedWrites.clear(write.path);
      return;
    }
    if (!this.settings.enabled || !shouldManagePath(file.path, this.settings)) return;
    await this.processModifiedWrite(file, write);
  }

  private async processModifiedWrite(file: TFile, write: PendingModifiedWrite) {
    await this.processFile(file, {
      createdMs: write.createdMs,
      modifiedMs: write.modifiedMs,
      overwriteModified: true,
    });
  }

  private async processFile(file: TFile, options: DateFrontmatterOptions): Promise<boolean> {
    let changed = false;
    this.markPluginWrite(file.path);
    try {
      await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        changed = applyDateFrontmatter(frontmatter, this.settings, options);
      });
      if (!changed) this.pluginWritePaths.delete(file.path);
      return changed;
    } catch (error) {
      this.pluginWritePaths.delete(file.path);
      new Notice(String(error));
      throw error;
    }
  }

  private markPluginWrite(filePath: string) {
    this.pluginWritePaths.add(filePath);
    window.setTimeout(() => {
      this.pluginWritePaths.delete(filePath);
    }, PLUGIN_WRITE_GUARD_MS);
  }

  private hasDateFields(file: TFile): boolean {
    const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return false;
    return Boolean(frontmatter[this.settings.createdField] && frontmatter[this.settings.modifiedField]);
  }
}
