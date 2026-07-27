import { MarkdownView, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import {
  applyDateFrontmatter,
  DeferredModifiedWriteQueue,
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

export class FrontmatterDateManager {
  private localEditPaths = new Set<string>();
  private deferredModifiedWrites = new DeferredModifiedWriteQueue();
  private unloaded = false;
  private plugin: Plugin;
  private settings: FrontmatterDateSettings;
  private formatSettings: NoteFormatSettings;

  constructor(plugin: Plugin, settings: FrontmatterDateSettings, formatSettings: NoteFormatSettings) {
    this.plugin = plugin;
    this.settings = settings;
    this.formatSettings = formatSettings;
  }

  updateSettings(settings: FrontmatterDateSettings, formatSettings: NoteFormatSettings) {
    this.settings = settings;
    this.formatSettings = formatSettings;
  }

  register() {
    this.plugin.register(() => {
      this.unloaded = true;
    });
    this.plugin.app.workspace.onLayoutReady(() => {
      if (this.unloaded) return;
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
          void this.flushReady();
        }),
      );
      this.plugin.registerEvent(
        this.plugin.app.workspace.on("layout-change", () => {
          void this.flushReady();
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

  async formatAll(): Promise<BackfillResult> {
    const result: BackfillResult = { processed: 0, updated: 0, skipped: 0, failed: 0 };
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (!shouldManagePath(file.path, this.settings)) {
        result.skipped++;
        continue;
      }
      result.processed++;
      try {
        const content = await this.plugin.app.vault.cachedRead(file);
        if (formatNoteContent(content, this.formatSettings) === null) {
          result.skipped++;
          continue;
        }
        await this.plugin.app.vault.process(
          file,
          (current) => formatNoteContent(current, this.formatSettings) ?? current,
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
    for (const write of writes) {
      const file = this.plugin.app.vault.getAbstractFileByPath(write.path);
      if (!(file instanceof TFile)) continue;
      if (!this.settings.enabled || !shouldManagePath(file.path, this.settings)) continue;
      await this.processModifiedWrite(file, write);
    }
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
    this.deferredModifiedWrites.rename(oldPath, file.path);
    if (this.localEditPaths.delete(oldPath)) {
      this.localEditPaths.add(file.path);
    }
    if (!this.settings.enabled || !(file instanceof TFile)) return;
    if (!shouldManagePath(file.path, this.settings)) return;
    if (this.hasDateFields(file)) return;
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
    const writes = this.deferredModifiedWrites.takeReady(this.collectOpenMarkdownPaths());
    for (const write of writes) {
      const file = this.plugin.app.vault.getAbstractFileByPath(write.path);
      if (!(file instanceof TFile)) continue;
      if (!this.settings.enabled || !shouldManagePath(file.path, this.settings)) continue;
      await this.processModifiedWrite(file, write);
    }
  }

  private async processModifiedWrite(file: TFile, write: PendingModifiedWrite) {
    await this.processFile(file, {
      createdMs: write.createdMs,
      modifiedMs: write.modifiedMs,
      overwriteModified: true,
    });
    await this.formatFile(file);
  }

  private async formatFile(file: TFile) {
    try {
      const content = await this.plugin.app.vault.cachedRead(file);
      if (formatNoteContent(content, this.formatSettings) === null) return;
      await this.plugin.app.vault.process(
        file,
        (current) => formatNoteContent(current, this.formatSettings) ?? current,
      );
    } catch (error) {
      new Notice(String(error));
      throw error;
    }
  }

  private async processFile(file: TFile, options: DateFrontmatterOptions): Promise<boolean> {
    let changed = false;
    try {
      await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        changed = applyDateFrontmatter(frontmatter, this.settings, options);
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
    return Boolean(frontmatter[this.settings.createdField] && frontmatter[this.settings.modifiedField]);
  }
}
