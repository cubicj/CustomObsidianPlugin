import { Plugin } from "obsidian";
import type {
  MarkdownPostProcessorContext,
  MarkdownSectionInformation,
} from "obsidian";
import {
  getReadingListKind,
  hasReadingListBlankBefore,
  resolveReadingListSourceLine,
} from "./reading-list-blank-lines-utils";

const LIST_BLANK_BEFORE_CLASS = "cubicj-list-blank-before";

function collectListContainers(root: HTMLElement): HTMLElement[] {
  const containers = Array.from(root.querySelectorAll<HTMLElement>("ul, ol"));
  if (root.matches("ul, ol")) {
    containers.unshift(root);
  }
  return containers;
}

function collectDirectListItems(container: HTMLElement): HTMLLIElement[] {
  return Array.from(container.children).filter(
    (child): child is HTMLLIElement => child.tagName === "LI",
  );
}

function isSameSection(
  left: MarkdownSectionInformation,
  right: MarkdownSectionInformation,
): boolean {
  return (
    left.text === right.text &&
    left.lineStart === right.lineStart &&
    left.lineEnd === right.lineEnd
  );
}

function clearListBlankBeforeHooks(root: HTMLElement): void {
  if (root.matches(`li.${LIST_BLANK_BEFORE_CLASS}`)) {
    root.classList.remove(LIST_BLANK_BEFORE_CLASS);
  }
  for (const item of Array.from(root.querySelectorAll(`li.${LIST_BLANK_BEFORE_CLASS}`))) {
    item.classList.remove(LIST_BLANK_BEFORE_CLASS);
  }
}

function annotateListContainer(
  container: HTMLElement,
  context: MarkdownPostProcessorContext,
): void {
  const kind = getReadingListKind(container.tagName);
  if (kind === null) {
    return;
  }

  const items = collectDirectListItems(container);
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1];
    const current = items[index];
    const previousInfo = context.getSectionInfo(previous);
    const currentInfo = context.getSectionInfo(current);
    if (
      previousInfo === null ||
      currentInfo === null ||
      !isSameSection(previousInfo, currentInfo)
    ) {
      continue;
    }

    const previousLine = resolveReadingListSourceLine(
      previousInfo.lineStart,
      previous.getAttribute("data-line"),
    );
    const currentLine = resolveReadingListSourceLine(
      currentInfo.lineStart,
      current.getAttribute("data-line"),
    );
    if (
      previousLine === null ||
      currentLine === null ||
      previousLine > previousInfo.lineEnd ||
      currentLine > currentInfo.lineEnd
    ) {
      continue;
    }

    const lines = currentInfo.text.split(/\r\n?|\n/u);
    if (
      !hasReadingListBlankBefore(lines, { kind, previousLine, currentLine }) ||
      previous.parentElement !== container ||
      current.parentElement !== container ||
      previous.nextElementSibling !== current
    ) {
      continue;
    }
    current.classList.add(LIST_BLANK_BEFORE_CLASS);
  }
}

function annotateListBlankLines(
  root: HTMLElement,
  context: MarkdownPostProcessorContext,
): void {
  clearListBlankBeforeHooks(root);
  for (const container of collectListContainers(root)) {
    annotateListContainer(container, context);
  }
}

export class ReadingListBlankLinesManager {
  constructor(private plugin: Plugin) {}

  register(): void {
    this.plugin.registerMarkdownPostProcessor((element, context) => {
      annotateListBlankLines(element, context);
    });
  }
}
