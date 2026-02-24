import { MarkdownView } from "obsidian";

let originalSetEphemeralState: Function | null = null;

export function enableNoAutoFocus() {
  originalSetEphemeralState = MarkdownView.prototype.setEphemeralState;
  MarkdownView.prototype.setEphemeralState = function (state: any) {
    if (originalSetEphemeralState) {
      originalSetEphemeralState.call(this, { ...state, focus: false });
      requestAnimationFrame(() => {
        const cm = (this as any).editor?.cm;
        if (cm?.hasFocus) {
          cm.contentDOM.blur();
        }
      });
    }
  };
}

export function disableNoAutoFocus() {
  if (originalSetEphemeralState) {
    MarkdownView.prototype.setEphemeralState = originalSetEphemeralState as any;
    originalSetEphemeralState = null;
  }
}
