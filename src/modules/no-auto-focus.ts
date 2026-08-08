import { MarkdownView } from "obsidian";

type SetEphemeralState = (this: MarkdownView, state: unknown) => void;

interface CodeMirrorLike {
  contentDOM: HTMLElement;
}

interface MarkdownViewLike {
  editor?: {
    cm?: CodeMirrorLike;
  };
}

let originalSetEphemeralState: SetEphemeralState | null = null;
let pendingBlurFrame: number | null = null;

export function enableNoAutoFocus() {
  const setEphemeralState = MarkdownView.prototype.setEphemeralState;
  if (typeof setEphemeralState !== "function") {
    return;
  }
  originalSetEphemeralState = setEphemeralState;
  MarkdownView.prototype.setEphemeralState = function (state: unknown) {
    if (originalSetEphemeralState) {
      const target = (this as unknown as MarkdownViewLike).editor?.cm?.contentDOM;
      originalSetEphemeralState.call(this, {
        ...(state as Record<PropertyKey, unknown>),
        focus: false,
      });
      if (pendingBlurFrame !== null) {
        cancelAnimationFrame(pendingBlurFrame);
        pendingBlurFrame = null;
      }
      if (target) {
        pendingBlurFrame = requestAnimationFrame(() => {
          pendingBlurFrame = null;
          if (target.ownerDocument.activeElement === target) {
            target.blur();
          }
        });
      }
    }
  };
}

export function disableNoAutoFocus() {
  if (pendingBlurFrame !== null) {
    cancelAnimationFrame(pendingBlurFrame);
    pendingBlurFrame = null;
  }
  if (originalSetEphemeralState) {
    MarkdownView.prototype.setEphemeralState = originalSetEphemeralState;
    originalSetEphemeralState = null;
  }
}
