import { Plugin } from "obsidian";
import {
  isReadingBracketBoundaryTag,
  isReadingBracketExcludedElement,
  planReadingBracketDecorations,
} from "./reading-brackets-utils";
import type { ReadingBracketDecoration } from "./reading-brackets-utils";

export interface ReadingBracketsSettings {
  enabled: boolean;
}

export const DEFAULT_READING_BRACKETS_SETTINGS: ReadingBracketsSettings = {
  enabled: true,
};

interface ObsidianWindow extends Window {
  createFragment(): DocumentFragment;
  createSpan(options?: DomElementInfo | string): HTMLSpanElement;
}

interface ObsidianDocument extends Document {
  win: ObsidianWindow;
}

function getObsidianWindow(document: Document): ObsidianWindow {
  return (document as ObsidianDocument).win;
}

function collectTextRuns(root: HTMLElement): Text[][] {
  const runs: Text[][] = [];
  let current: Text[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  };

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (text.data.length > 0) {
        current.push(text);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      flush();
      return;
    }

    const element = node as Element;
    if (
      element.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      isReadingBracketExcludedElement(element.tagName, Array.from(element.classList))
    ) {
      flush();
      return;
    }

    const boundary = isReadingBracketBoundaryTag(element.tagName);
    if (boundary) {
      flush();
    }
    for (const child of Array.from(element.childNodes)) {
      visit(child);
    }
    if (boundary) {
      flush();
    }
  };

  visit(root);
  flush();
  return runs;
}

function buildReplacement(
  document: Document,
  source: string,
  decorations: readonly ReadingBracketDecoration[],
): DocumentFragment {
  const ownerWindow = getObsidianWindow(document);
  const replacement = ownerWindow.createFragment();
  let cursor = 0;
  let activeMarker = -1;
  let wrapper: HTMLSpanElement | null = null;

  for (let index = 0; index < decorations.length; index++) {
    const decoration = decorations[index];
    if (decoration.start > cursor) {
      replacement.append(source.slice(cursor, decoration.start));
      activeMarker = -1;
      wrapper = null;
    }
    if (wrapper === null || activeMarker !== decoration.markerIndex) {
      wrapper = ownerWindow.createSpan({ cls: "cubicj-bracket-marker" });
      replacement.append(wrapper);
      activeMarker = decoration.markerIndex;
    }

    const segment = ownerWindow.createSpan({
      cls:
        decoration.kind === "glyph"
          ? "cubicj-bracket-glyph"
          : "cubicj-bracket-label",
      text: source.slice(decoration.start, decoration.end),
    });
    wrapper.append(segment);
    cursor = decoration.end;

    const next = decorations[index + 1];
    if (
      next === undefined ||
      next.markerIndex !== activeMarker ||
      next.start !== cursor
    ) {
      activeMarker = -1;
      wrapper = null;
    }
  }

  if (cursor < source.length) {
    replacement.append(source.slice(cursor));
  }
  return replacement;
}

function decorateRun(run: readonly Text[]): void {
  const sources = run.map((node) => node.data);
  const parents = run.map((node) => node.parentNode);
  const decorations = planReadingBracketDecorations(sources);
  const byFragment = new Map<number, ReadingBracketDecoration[]>();

  for (const decoration of decorations) {
    const fragmentDecorations = byFragment.get(decoration.fragmentIndex) ?? [];
    fragmentDecorations.push(decoration);
    byFragment.set(decoration.fragmentIndex, fragmentDecorations);
  }

  for (const [fragmentIndex, fragmentDecorations] of byFragment) {
    const node = run[fragmentIndex];
    const source = sources[fragmentIndex];
    if (node.parentNode !== parents[fragmentIndex] || node.data !== source) {
      continue;
    }
    node.replaceWith(buildReplacement(node.ownerDocument, source, fragmentDecorations));
  }
}

export class ReadingBracketsManager {
  constructor(
    private plugin: Plugin,
    private getSettings: () => ReadingBracketsSettings,
  ) {}

  register(): void {
    this.plugin.registerMarkdownPostProcessor((element) => {
      if (!this.getSettings().enabled) {
        return;
      }
      for (const run of collectTextRuns(element)) {
        decorateRun(run);
      }
    });
  }
}
