import { forceParsing, syntaxTreeAvailable } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { clampParseTarget, decideEagerParse } from "./eager-parse-utils";

export interface EagerParseSettings {
  enabled: boolean;
}

export const DEFAULT_EAGER_PARSE_SETTINGS: EagerParseSettings = {
  enabled: true,
};

const BUDGET_MS = 50;

export function createEagerParseExtension(
  getSettings: () => EagerParseSettings,
): Extension {
  return ViewPlugin.fromClass(
    class {
      private animationFrame: number | null = null;
      private animationWindow: Window | null = null;

      constructor(private readonly view: EditorView) {
        this.schedule();
      }

      update(update: ViewUpdate): void {
        if (update.viewportChanged || update.docChanged) {
          this.schedule();
        }
      }

      destroy(): void {
        if (this.animationFrame !== null && this.animationWindow !== null) {
          this.animationWindow.cancelAnimationFrame(this.animationFrame);
          this.animationFrame = null;
          this.animationWindow = null;
        }
      }

      private schedule(): void {
        if (this.animationFrame !== null) {
          return;
        }
        const animationWindow = this.view.dom.ownerDocument.defaultView ?? window;
        this.animationWindow = animationWindow;
        this.animationFrame = animationWindow.requestAnimationFrame(() => {
          this.animationFrame = null;
          this.animationWindow = null;
          this.catchUp();
        });
      }

      private catchUp(): void {
        const settings = getSettings();
        const target = clampParseTarget(this.view.viewport.to, this.view.state.doc.length);
        try {
          const decision = decideEagerParse({
            enabled: settings.enabled,
            composing: this.view.composing,
            treeAvailable: syntaxTreeAvailable(this.view.state, target),
          });
          if (decision === "skip") {
            return;
          }
          if (decision === "defer") {
            this.schedule();
            return;
          }
          if (!forceParsing(this.view, target, BUDGET_MS)) {
            this.schedule();
          }
        } catch (error) {
          void error;
        }
      }
    },
  );
}
