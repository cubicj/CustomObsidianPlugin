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

const READING_BRACKETS_STYLE_ID = "cubicj-reading-brackets";
const READING_BRACKETS_STYLES = `
.cubicj-bracket-glyph {
  color: var(--text-faint);
}
.cubicj-bracket-label {
  color: var(--link-external-color);
}
`;

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
  const replacement = document.createDocumentFragment();
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
      wrapper = document.createElement("span");
      wrapper.className = "cubicj-bracket-marker";
      replacement.append(wrapper);
      activeMarker = decoration.markerIndex;
    }

    const segment = document.createElement("span");
    segment.className =
      decoration.kind === "glyph" ? "cubicj-bracket-glyph" : "cubicj-bracket-label";
    segment.textContent = source.slice(decoration.start, decoration.end);
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
  private readonly styles = new Map<Document, HTMLStyleElement>();

  constructor(
    private plugin: Plugin,
    private getSettings: () => ReadingBracketsSettings,
  ) {}

  register(): void {
    this.plugin.register(() => this.removeStyles());
    if (this.getSettings().enabled) {
      this.ensureStyles(document);
    } else {
      document.getElementById(READING_BRACKETS_STYLE_ID)?.remove();
    }
    this.plugin.registerMarkdownPostProcessor((element) => {
      if (!this.getSettings().enabled) {
        this.removeStyles();
        return;
      }
      this.ensureStyles(element.ownerDocument);
      for (const run of collectTextRuns(element)) {
        decorateRun(run);
      }
    });
  }

  private ensureStyles(ownerDocument: Document): void {
    const tracked = this.styles.get(ownerDocument);
    if (tracked !== undefined && tracked.parentNode !== null) {
      return;
    }
    this.styles.delete(ownerDocument);
    ownerDocument.getElementById(READING_BRACKETS_STYLE_ID)?.remove();
    const style = ownerDocument.createElement("style");
    style.id = READING_BRACKETS_STYLE_ID;
    style.textContent = READING_BRACKETS_STYLES;
    ownerDocument.head.appendChild(style);
    this.styles.set(ownerDocument, style);
  }

  private removeStyles(): void {
    for (const style of this.styles.values()) {
      style.remove();
    }
    this.styles.clear();
  }
}
