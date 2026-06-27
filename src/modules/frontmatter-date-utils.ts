export interface FrontmatterDateSettings {
  enabled: boolean;
  createdField: string;
  modifiedField: string;
  managedFolders: string[];
  excludedPaths: string[];
}

export interface DateFrontmatterOptions {
  createdMs: number;
  modifiedMs: number;
  overwriteModified: boolean;
}

export interface PendingModifiedWrite {
  path: string;
  createdMs: number;
  modifiedMs: number;
}

export const DEFAULT_FRONTMATTER_DATE_SETTINGS: FrontmatterDateSettings = {
  enabled: true,
  createdField: "created",
  modifiedField: "modified",
  managedFolders: ["1. Inbox/", "2. Hubs/", "3. Resources/", "4. Daily Note/"],
  excludedPaths: [".obsidian/", ".trash/", "Templates/", "Attached Files/", "cubicj-brewing/"],
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function formatKstTimestamp(ms: number): string {
  const date = new Date(ms + KST_OFFSET_MS);
  const yyyy = date.getUTCFullYear();
  const MM = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const HH = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}+09:00`;
}

export function splitPathList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => normalizeFolderPrefix(line.trim()))
    .filter((line) => line.length > 0);
}

export function joinPathList(paths: string[]): string {
  return paths.join("\n");
}

export function normalizeFolderPrefix(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.length === 0) return "";
  if (normalized.endsWith(".md")) return normalized;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function shouldManagePath(filePath: string, settings: FrontmatterDateSettings): boolean {
  if (!filePath.endsWith(".md")) return false;
  const normalized = filePath.replace(/\\/g, "/");
  if (settings.excludedPaths.some((path) => normalized.startsWith(normalizeFolderPrefix(path)))) {
    return false;
  }
  return settings.managedFolders.some((path) => normalized.startsWith(normalizeFolderPrefix(path)));
}

export function applyDateFrontmatter(
  frontmatter: Record<string, unknown>,
  settings: FrontmatterDateSettings,
  options: DateFrontmatterOptions,
): boolean {
  let changed = false;
  if (!frontmatter[settings.createdField]) {
    frontmatter[settings.createdField] = formatKstTimestamp(options.createdMs);
    changed = true;
  }
  if (options.overwriteModified || !frontmatter[settings.modifiedField]) {
    const modified = formatKstTimestamp(options.modifiedMs);
    if (frontmatter[settings.modifiedField] !== modified) {
      frontmatter[settings.modifiedField] = modified;
      changed = true;
    }
  }
  return changed;
}

export function shouldDeferModifiedWrite(filePath: string, activeFilePath: string | null | undefined): boolean {
  return activeFilePath === filePath;
}

export class DeferredModifiedWriteQueue {
  private pending: PendingModifiedWrite | null = null;

  set(write: PendingModifiedWrite) {
    this.pending = write;
  }

  takeReady(activeFilePath: string | null | undefined): PendingModifiedWrite | null {
    if (!this.pending || this.pending.path === activeFilePath) return null;
    const ready = this.pending;
    this.pending = null;
    return ready;
  }

  clear(path: string) {
    if (this.pending?.path === path) {
      this.pending = null;
    }
  }
}
