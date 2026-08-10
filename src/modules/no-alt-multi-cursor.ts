import { Prec } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { decideClickAddsSelectionRange } from "./no-alt-multi-cursor-utils";

export interface NoAltMultiCursorSettings {
  enabled: boolean;
}

export const DEFAULT_NO_ALT_MULTI_CURSOR_SETTINGS: NoAltMultiCursorSettings = {
  enabled: true,
};

export function createNoAltMultiCursorExtension(
  getSettings: () => NoAltMultiCursorSettings,
): Extension {
  return Prec.highest(
    EditorView.clickAddsSelectionRange.of((event) =>
      decideClickAddsSelectionRange(getSettings().enabled, event),
    ),
  );
}
