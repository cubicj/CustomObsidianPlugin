import { Prec } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { isHeadingLine, scanRegions } from "./note-format-utils";
import type { NoteFormatSettings } from "./note-format-utils";

export function createHeadingEnterExtension(getSettings: () => NoteFormatSettings): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view) => handleEnter(view, getSettings()),
      },
    ]),
  );
}

function handleEnter(view: EditorView, settings: NoteFormatSettings): boolean {
  if (!settings.headingEnterBlankLine) return false;
  if (view.composing) return false;
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) return false;
  if (!isHeadingLine(line.text)) return false;
  if (isSkippedRegion(view, line.number)) return false;
  view.dispatch({
    changes: { from: range.head, insert: "\n\n" },
    selection: { anchor: range.head + 2 },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

function isSkippedRegion(view: EditorView, lineNumber: number): boolean {
  const lines: string[] = [];
  for (const text of view.state.doc.iterLines(1, lineNumber + 1)) {
    lines.push(text);
  }
  return scanRegions(lines)[lineNumber - 1] !== "normal";
}
