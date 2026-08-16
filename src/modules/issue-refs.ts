import { syntaxTree } from "@codemirror/language";
import type { Extension, Range } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { Plugin } from "obsidian";
import {
  findIssueReferences,
  isIssueReferenceExcludedReadingElement,
  isIssueReferenceExcludedSyntaxNode,
} from "./issue-refs-utils";

const ISSUE_REFERENCE_CLASS = "cubicj-issue-ref";
const ISSUE_REFERENCE_TAIL_CLASS = "cubicj-issue-ref-tail";
const issueReferenceMark = Decoration.mark({ class: ISSUE_REFERENCE_CLASS });
const issueReferenceTailMark = Decoration.mark({ class: ISSUE_REFERENCE_TAIL_CLASS });

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

function rangeHasExcludedSyntax(
  tree: ReturnType<typeof syntaxTree>,
  from: number,
  to: number,
): boolean {
  let excluded = false;
  tree.iterate({
    from,
    to,
    enter(node) {
      if (isIssueReferenceExcludedSyntaxNode(node.name)) {
        excluded = true;
        return false;
      }
    },
  });
  return excluded;
}

function buildIssueReferenceDecorations(
  view: EditorView,
  tree: ReturnType<typeof syntaxTree>,
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const visitedLines = new Set<number>();
  const document = view.state.doc;

  for (const visibleRange of view.visibleRanges) {
    let line = document.lineAt(visibleRange.from);
    for (;;) {
      if (!visitedLines.has(line.number)) {
        visitedLines.add(line.number);
        for (const reference of findIssueReferences(line.text)) {
          const from = line.from + reference.from;
          const to = line.from + reference.to;
          const contextTo =
            reference.kind === "digit-led-tag"
              ? line.from + reference.tailTo
              : to;
          if (rangeHasExcludedSyntax(tree, from, contextTo)) {
            continue;
          }
          decorations.push(issueReferenceMark.range(from, to));
          if (reference.kind === "digit-led-tag") {
            decorations.push(
              issueReferenceTailMark.range(
                line.from + reference.tailFrom,
                line.from + reference.tailTo,
              ),
            );
          }
        }
      }
      if (line.to >= visibleRange.to || line.number === document.lines) {
        break;
      }
      line = document.line(line.number + 1);
    }
  }

  return Decoration.set(decorations, true);
}

export function createIssueRefsExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private tree: ReturnType<typeof syntaxTree>;

      constructor(view: EditorView) {
        this.tree = syntaxTree(view.state);
        this.decorations = buildIssueReferenceDecorations(view, this.tree);
      }

      update(update: ViewUpdate): void {
        const tree = syntaxTree(update.state);
        if (update.docChanged || update.viewportChanged || tree !== this.tree) {
          this.tree = tree;
          this.decorations = buildIssueReferenceDecorations(update.view, tree);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
}

function collectDigitLedTagAnchors(root: HTMLElement): HTMLAnchorElement[] {
  const anchors: HTMLAnchorElement[] = [];

  const visit = (node: Node): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node as Element;
    if (
      element.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      isIssueReferenceExcludedReadingElement(
        element.tagName,
        Array.from(element.classList),
      )
    ) {
      return;
    }
    if (element.tagName === "A" && element.classList.contains("tag")) {
      anchors.push(element as HTMLAnchorElement);
      return;
    }
    for (const child of Array.from(element.childNodes)) {
      visit(child);
    }
  };

  visit(root);
  return anchors;
}

function replaceDigitLedTagAnchor(anchor: HTMLAnchorElement): void {
  const source = anchor.textContent;
  if (source === null) {
    return;
  }
  const match = /^#(\d+)(\D[\s\S]*)$/u.exec(source);
  if (match === null) {
    return;
  }

  const ownerWindow = getObsidianWindow(anchor.ownerDocument);
  const reference = ownerWindow.createSpan({
    cls: ISSUE_REFERENCE_CLASS,
    text: `#${match[1]}`,
  });
  anchor.replaceWith(reference, anchor.ownerDocument.createTextNode(match[2]));
}

function collectIssueReferenceTextNodes(root: HTMLElement): Text[] {
  const textNodes: Text[] = [];

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (text.data.length > 0) {
        textNodes.push(text);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as Element;
    if (
      element.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      isIssueReferenceExcludedReadingElement(
        element.tagName,
        Array.from(element.classList),
      )
    ) {
      return;
    }

    for (const child of Array.from(element.childNodes)) {
      visit(child);
    }
  };

  visit(root);
  return textNodes;
}

function decorateIssueReferenceTextNode(node: Text): void {
  const source = node.data;
  const references = findIssueReferences(source);
  if (references.length === 0) {
    return;
  }

  const ownerWindow = getObsidianWindow(node.ownerDocument);
  const replacement = ownerWindow.createFragment();
  let cursor = 0;
  for (const reference of references) {
    if (reference.from > cursor) {
      replacement.append(source.slice(cursor, reference.from));
    }
    replacement.append(
      ownerWindow.createSpan({
        cls: ISSUE_REFERENCE_CLASS,
        text: source.slice(reference.from, reference.to),
      }),
    );
    cursor = reference.to;
  }
  if (cursor < source.length) {
    replacement.append(source.slice(cursor));
  }
  node.replaceWith(replacement);
}

function decorateReadingIssueReferences(root: HTMLElement): void {
  for (const anchor of collectDigitLedTagAnchors(root)) {
    replaceDigitLedTagAnchor(anchor);
  }
  for (const textNode of collectIssueReferenceTextNodes(root)) {
    decorateIssueReferenceTextNode(textNode);
  }
}

export class IssueRefsManager {
  constructor(private plugin: Plugin) {}

  register(): void {
    this.plugin.registerMarkdownPostProcessor((element) => {
      decorateReadingIssueReferences(element);
    });
  }
}
