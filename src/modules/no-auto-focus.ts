import { MarkdownView } from "obsidian";

type SetEphemeralState = (this: MarkdownView, state: unknown) => void;

interface CodeMirrorLike {
  hasFocus: boolean;
  contentDOM: HTMLElement;
}

interface MarkdownViewLike {
  editor?: {
    cm?: CodeMirrorLike;
  };
}

let originalSetEphemeralState: SetEphemeralState | null = null;

export function enableNoAutoFocus() {
  const setEphemeralState = MarkdownView.prototype.setEphemeralState;
  if (typeof setEphemeralState !== "function") {
    return;
  }
  originalSetEphemeralState = setEphemeralState;
  MarkdownView.prototype.setEphemeralState = function (state: unknown) {
    if (originalSetEphemeralState) {
      originalSetEphemeralState.call(this, {
        ...(state as Record<PropertyKey, unknown>),
        focus: false,
      });
      requestAnimationFrame(() => {
        const cm = (this as unknown as MarkdownViewLike).editor?.cm;
        if (cm?.hasFocus) {
          cm.contentDOM.blur();
        }
      });
    }
  };
}

export function disableNoAutoFocus() {
  if (originalSetEphemeralState) {
    MarkdownView.prototype.setEphemeralState = originalSetEphemeralState;
    originalSetEphemeralState = null;
  }
}
