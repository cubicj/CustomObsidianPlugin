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
let patchedSetEphemeralState: SetEphemeralState | null = null;
let pendingBlurFrame: number | null = null;
let pendingBlurWindow: Window | null = null;

export function enableNoAutoFocus() {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The prototype method is invoked with each live view as its receiver.
  const setEphemeralState = MarkdownView.prototype.setEphemeralState;
  if (typeof setEphemeralState !== "function") {
    return;
  }
  originalSetEphemeralState = setEphemeralState;
  const patched: SetEphemeralState = function (state: unknown) {
    const target = (this as unknown as MarkdownViewLike).editor?.cm?.contentDOM;
    setEphemeralState.call(this, {
      ...(state as Record<PropertyKey, unknown>),
      focus: false,
    });
    if (pendingBlurFrame !== null && pendingBlurWindow !== null) {
      pendingBlurWindow.cancelAnimationFrame(pendingBlurFrame);
      pendingBlurFrame = null;
      pendingBlurWindow = null;
    }
    if (target) {
      const ownerWindow = target.ownerDocument.defaultView ?? window;
      pendingBlurWindow = ownerWindow;
      pendingBlurFrame = ownerWindow.requestAnimationFrame(() => {
        pendingBlurFrame = null;
        pendingBlurWindow = null;
        if (target.ownerDocument.activeElement === target) {
          target.blur();
        }
      });
    }
  };
  patchedSetEphemeralState = patched;
  MarkdownView.prototype.setEphemeralState = patched;
}

export function disableNoAutoFocus() {
  if (pendingBlurFrame !== null && pendingBlurWindow !== null) {
    pendingBlurWindow.cancelAnimationFrame(pendingBlurFrame);
    pendingBlurFrame = null;
    pendingBlurWindow = null;
  }
  if (
    originalSetEphemeralState &&
    patchedSetEphemeralState &&
    MarkdownView.prototype.setEphemeralState === patchedSetEphemeralState
  ) {
    MarkdownView.prototype.setEphemeralState = originalSetEphemeralState;
  }
  originalSetEphemeralState = null;
  patchedSetEphemeralState = null;
}
