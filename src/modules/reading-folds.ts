import { MarkdownPreviewView, MarkdownView, Plugin, TFile } from "obsidian";
import {
  collectHeadingFoldLines,
  countLines,
  isHeadingSectionHtml,
} from "./reading-folds-utils";
import type { AppWithFoldManager } from "./obsidian-internals";

export interface ReadingFoldsSettings {
  enabled: boolean;
}

export const DEFAULT_READING_FOLDS_SETTINGS: ReadingFoldsSettings = {
  enabled: true,
};

type PreviewSet = (
  this: MarkdownPreviewView,
  data: unknown,
  clear: unknown,
) => void;

type ParseFinish = (this: RendererLike, ...args: unknown[]) => unknown;

interface MarkdownPreviewPrototypeLike {
  set?: PreviewSet;
}

interface MarkdownViewLike {
  previewMode?: unknown;
  file?: unknown;
}

interface MarkdownPreviewViewLike {
  view?: MarkdownViewLike;
  renderer?: unknown;
}

interface RendererLike {
  text?: unknown;
  lastText?: unknown;
  sections?: unknown;
  parseFinish?: ParseFinish;
}

interface SectionLike {
  html?: unknown;
  start?: unknown;
  headingCollapsed?: boolean;
  setCollapsed?: (collapsed: boolean) => unknown;
}

interface SectionStartLike {
  line?: unknown;
}

interface VaultLike {
  getConfig?: (key: string) => unknown;
}

interface AppLike extends AppWithFoldManager {
  vault?: VaultLike;
}

interface PendingParseFinish {
  originalParseFinish: ParseFinish;
  patchedParseFinish: ParseFinish;
  expectedText: string;
  planLines: Set<number>;
}

export class ReadingFoldsManager {
  private originalSet: PreviewSet | null = null;
  private patchedSet: PreviewSet | null = null;
  private pending = new Map<RendererLike, PendingParseFinish>();

  constructor(
    private plugin: Plugin,
    private getSettings: () => ReadingFoldsSettings,
  ) {}

  register(): void {
    const proto = MarkdownPreviewView.prototype as unknown as MarkdownPreviewPrototypeLike;
    if (typeof proto.set !== "function") {
      return;
    }
    const original = proto.set;
    this.originalSet = original;
    const preload = (
      previewView: MarkdownPreviewView,
      preview: MarkdownPreviewViewLike,
      renderer: RendererLike,
      data: unknown,
    ): void => this.preload(previewView, preview, renderer, data);
    const clearPending = (renderer: RendererLike): void =>
      this.clearPending(renderer);
    const patchedSet: PreviewSet = function (data: unknown, clear: unknown) {
      original.call(this, data, clear);
      let renderer: RendererLike | null = null;
      try {
        const preview = this as unknown as MarkdownPreviewViewLike;
        if (typeof preview.renderer !== "object" || preview.renderer === null) {
          return;
        }
        renderer = preview.renderer;
        preload(this, preview, renderer, data);
      } catch {
        if (renderer) {
          clearPending(renderer);
        }
      }
    };
    this.patchedSet = patchedSet;
    proto.set = patchedSet;
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => {
        this.sweepPending();
      }),
    );
    this.plugin.register(() => {
      if (
        this.originalSet &&
        this.patchedSet &&
        proto.set === this.patchedSet
      ) {
        proto.set = this.originalSet;
      }
      this.originalSet = null;
      this.patchedSet = null;
      for (const renderer of [...this.pending.keys()]) {
        this.clearPending(renderer);
      }
    });
  }

  private preload(
    previewView: MarkdownPreviewView,
    preview: MarkdownPreviewViewLike,
    renderer: RendererLike,
    data: unknown,
  ): void {
    if (!this.getSettings().enabled || typeof data !== "string") {
      this.clearPending(renderer);
      return;
    }
    const view = preview.view;
    if (!view || view.previewMode !== previewView || !(view.file instanceof TFile)) {
      this.clearPending(renderer);
      return;
    }
    const app = this.plugin.app as unknown as AppLike;
    const vault = app.vault;
    if (
      !vault ||
      typeof vault.getConfig !== "function" ||
      !vault.getConfig("foldHeading")
    ) {
      this.clearPending(renderer);
      return;
    }
    const foldManager = app.foldManager;
    if (!foldManager || typeof foldManager.load !== "function") {
      this.clearPending(renderer);
      return;
    }
    const planLines = collectHeadingFoldLines(
      foldManager.load.call(foldManager, view.file),
      countLines(data),
    );
    if (planLines === null) {
      this.clearPending(renderer);
      return;
    }
    if (renderer.lastText === renderer.text) {
      this.clearPending(renderer);
      this.applyPlan(renderer, planLines);
      return;
    }
    const pending = this.pending.get(renderer);
    if (pending) {
      pending.expectedText = data;
      pending.planLines = planLines;
      return;
    }
    if (typeof renderer.parseFinish !== "function") {
      this.clearPending(renderer);
      return;
    }
    const originalParseFinish = renderer.parseFinish;
    const pendingEntries = this.pending;
    const applyPlan = (planRenderer: RendererLike, lines: Set<number>): void =>
      this.applyPlan(planRenderer, lines);
    const clearPending = (pendingRenderer: RendererLike): void =>
      this.clearPending(pendingRenderer);
    const patchedParseFinish: ParseFinish = function (...args: unknown[]) {
      try {
        const result = originalParseFinish.apply(this, args);
        try {
          const current = pendingEntries.get(renderer);
          if (current && renderer.text === current.expectedText) {
            applyPlan(renderer, current.planLines);
          }
        } catch (error) {
          void error;
        }
        return result;
      } finally {
        clearPending(renderer);
      }
    };
    this.pending.set(renderer, {
      originalParseFinish,
      patchedParseFinish,
      expectedText: data,
      planLines,
    });
    renderer.parseFinish = patchedParseFinish;
  }

  private applyPlan(renderer: RendererLike, planLines: Set<number>): void {
    if (!Array.isArray(renderer.sections)) {
      return;
    }
    for (const value of renderer.sections) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const section = value as SectionLike;
      if (!isHeadingSectionHtml(section.html)) {
        continue;
      }
      if (typeof section.start !== "object" || section.start === null) {
        continue;
      }
      const line = (section.start as SectionStartLike).line;
      if (typeof line !== "number" || !Number.isFinite(line)) {
        continue;
      }
      const collapsed = planLines.has(line);
      if (typeof section.setCollapsed === "function") {
        section.setCollapsed(collapsed);
      } else {
        section.headingCollapsed = collapsed;
      }
    }
  }

  private sweepPending(): void {
    const liveRenderers = new Set<RendererLike>();
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) {
        continue;
      }
      const view = leaf.view as unknown as MarkdownViewLike;
      if (typeof view.previewMode !== "object" || view.previewMode === null) {
        continue;
      }
      const preview = view.previewMode as MarkdownPreviewViewLike;
      if (typeof preview.renderer === "object" && preview.renderer !== null) {
        liveRenderers.add(preview.renderer);
      }
    }
    for (const renderer of [...this.pending.keys()]) {
      if (!liveRenderers.has(renderer)) {
        this.clearPending(renderer);
      }
    }
  }

  private clearPending(renderer: RendererLike): void {
    const pending = this.pending.get(renderer);
    if (!pending) {
      return;
    }
    this.pending.delete(renderer);
    try {
      if (renderer.parseFinish === pending.patchedParseFinish) {
        renderer.parseFinish = pending.originalParseFinish;
      }
    } catch (error) {
      void error;
    }
  }
}
