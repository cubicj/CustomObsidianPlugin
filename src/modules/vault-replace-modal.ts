import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import { buildMatcher, buildPreviewLine } from "./vault-replace-utils";
import type { FileMatches, VaultReplaceManager } from "./vault-replace";

export const VAULT_REPLACE_STYLE_ID = "cubicj-vault-replace";

export const VAULT_REPLACE_STYLES = `
.cubicj-vault-replace.modal {
  --dialog-width: min(900px, 92vw);
  --modal-width: min(900px, 92vw);
  --modal-max-width: min(900px, 92vw);
  width: min(900px, 92vw);
  max-width: min(900px, 92vw);
}
.cubicj-vault-replace .cubicj-vr-field .setting-item-info {
  flex: 0 0 auto;
}
.cubicj-vault-replace .cubicj-vr-field .setting-item-control {
  flex: 1 1 auto;
}
.cubicj-vault-replace .cubicj-vr-field input[type="text"] {
  width: 100%;
}
.cubicj-vault-replace .cubicj-vr-results {
  max-height: 40vh;
  overflow-y: auto;
  margin: 0.5em 0;
  border-top: 1px solid var(--background-modifier-border);
}
.cubicj-vault-replace .cubicj-vr-file {
  padding: 0.4em 0;
  border-bottom: 1px solid var(--background-modifier-border);
}
.cubicj-vault-replace .cubicj-vr-file-header {
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.cubicj-vault-replace .cubicj-vr-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cubicj-vault-replace .cubicj-vr-count {
  color: var(--text-muted);
  font-size: var(--font-smaller);
}
.cubicj-vault-replace .cubicj-vr-preview {
  margin-left: 1.9em;
  color: var(--text-muted);
  font-size: var(--font-smaller);
  white-space: pre-wrap;
  word-break: break-word;
}
.cubicj-vault-replace .cubicj-vr-preview mark {
  background: var(--text-highlight-bg);
  color: inherit;
}
.cubicj-vault-replace .cubicj-vr-error {
  color: var(--text-error);
  font-size: var(--font-smaller);
  min-height: 1.2em;
}
.cubicj-vault-replace .cubicj-vr-warning {
  color: var(--text-warning);
  font-size: var(--font-smaller);
}
`;

const SCAN_DEBOUNCE_MS = 300;
const PREVIEW_LIMIT = 5;
const PREVIEW_RADIUS = 40;

export class VaultReplaceModal extends Modal {
  private manager: VaultReplaceManager;
  private findValue = "";
  private replaceValue = "";
  private caseSensitive = false;
  private useRegex = false;
  private results: FileMatches[] = [];
  private excluded = new Set<string>();
  private errorMessage = "";
  private generation = 0;
  private debounceTimer: number | null = null;
  private errorEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private applyButton!: ButtonComponent;

  constructor(app: App, manager: VaultReplaceManager) {
    super(app);
    this.manager = manager;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("cubicj-vault-replace");
    contentEl.empty();
    contentEl.createEl("h3", { text: "전체 파일 찾아 바꾸기" });

    new Setting(contentEl).setName("찾기").setClass("cubicj-vr-field").addText((text) => {
      text.setPlaceholder("찾을 내용").onChange((value) => {
        this.findValue = value;
        this.scheduleScan();
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });

    new Setting(contentEl).setName("바꾸기").setClass("cubicj-vr-field").addText((text) => {
      text.setPlaceholder("바꿀 내용").onChange((value) => {
        this.replaceValue = value;
      });
    });

    new Setting(contentEl).setName("대소문자 구분").addToggle((toggle) => {
      toggle.setValue(this.caseSensitive).onChange((value) => {
        this.caseSensitive = value;
        this.scheduleScan();
      });
    });

    new Setting(contentEl).setName("정규식").addToggle((toggle) => {
      toggle.setValue(this.useRegex).onChange((value) => {
        this.useRegex = value;
        this.scheduleScan();
      });
    });

    this.errorEl = contentEl.createDiv({ cls: "cubicj-vr-error" });
    this.summaryEl = contentEl.createDiv({ cls: "cubicj-vr-count" });
    this.resultsEl = contentEl.createDiv({ cls: "cubicj-vr-results" });
    contentEl.createDiv({
      cls: "cubicj-vr-warning",
      text: "치환한 내용은 디스크에 바로 기록되며 되돌릴 수 없습니다.",
    });

    new Setting(contentEl).addButton((button) => {
      this.applyButton = button;
      button
        .setButtonText("바꾸기")
        .setCta()
        .setDisabled(true)
        .onClick(() => {
          void this.runReplace();
        });
    });
  }

  onClose(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.generation++;
    this.contentEl.empty();
  }

  private scheduleScan(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.runScan();
    }, SCAN_DEBOUNCE_MS);
  }

  private async runScan(): Promise<void> {
    const generation = ++this.generation;
    this.errorMessage = "";
    this.results = [];
    this.excluded.clear();

    if (this.findValue.length === 0) {
      this.render();
      return;
    }

    const matcher = buildMatcher(this.findValue, {
      caseSensitive: this.caseSensitive,
      useRegex: this.useRegex,
    });
    if (!matcher.ok) {
      this.errorMessage = `정규식 오류: ${matcher.error}`;
      this.render();
      return;
    }

    const results = await this.manager.scan(matcher.regex);
    if (generation !== this.generation) {
      return;
    }
    this.results = results;
    this.render();
  }

  private render(): void {
    this.errorEl.setText(this.errorMessage);
    this.resultsEl.empty();

    if (this.errorMessage.length > 0 || this.findValue.length === 0) {
      this.summaryEl.setText("");
      this.updateApplyButton();
      return;
    }

    if (this.results.length === 0) {
      this.summaryEl.setText("일치하는 항목 없음");
      this.updateApplyButton();
      return;
    }

    const totalMatches = this.results.reduce((sum, item) => sum + item.matches.length, 0);
    this.summaryEl.setText(`${this.results.length}개 파일, ${totalMatches}개 매치`);

    for (const item of this.results) {
      const fileEl = this.resultsEl.createDiv({ cls: "cubicj-vr-file" });
      const headerEl = fileEl.createDiv({ cls: "cubicj-vr-file-header" });
      const checkbox = headerEl.createEl("input", { type: "checkbox" });
      checkbox.checked = !this.excluded.has(item.file.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.excluded.delete(item.file.path);
        } else {
          this.excluded.add(item.file.path);
        }
        this.updateApplyButton();
      });
      headerEl.createSpan({ cls: "cubicj-vr-path", text: item.file.path });
      headerEl.createSpan({ cls: "cubicj-vr-count", text: String(item.matches.length) });

      for (const match of item.matches.slice(0, PREVIEW_LIMIT)) {
        const segments = buildPreviewLine(
          match.lineText,
          match.column,
          match.end - match.start,
          PREVIEW_RADIUS,
        );
        const previewEl = fileEl.createDiv({ cls: "cubicj-vr-preview" });
        previewEl.createSpan({ text: segments.before });
        previewEl.createEl("mark", { text: segments.match });
        previewEl.createSpan({ text: segments.after });
      }

      if (item.matches.length > PREVIEW_LIMIT) {
        fileEl.createDiv({
          cls: "cubicj-vr-preview",
          text: `+${item.matches.length - PREVIEW_LIMIT}개 더`,
        });
      }
    }

    this.updateApplyButton();
  }

  private selectedResults(): FileMatches[] {
    return this.results.filter((item) => !this.excluded.has(item.file.path));
  }

  private updateApplyButton(): void {
    const selected = this.selectedResults();
    this.applyButton.setButtonText(
      selected.length > 0 ? `${selected.length}개 파일에 적용` : "바꾸기",
    );
    this.applyButton.setDisabled(selected.length === 0);
  }

  private async runReplace(): Promise<void> {
    const targets = this.selectedResults();
    if (targets.length === 0) {
      return;
    }
    const matcher = buildMatcher(this.findValue, {
      caseSensitive: this.caseSensitive,
      useRegex: this.useRegex,
    });
    if (!matcher.ok) {
      this.errorMessage = `정규식 오류: ${matcher.error}`;
      this.render();
      return;
    }
    this.applyButton.setDisabled(true);
    try {
      const result = await this.manager.replace(
        targets,
        matcher.regex,
        this.replaceValue,
        this.useRegex,
      );
      const failedSuffix = result.failed > 0 ? `, ${result.failed}개 실패` : "";
      new Notice(`${result.files}개 파일에서 ${result.matches}개 매치를 바꿨습니다${failedSuffix}`);
      this.close();
    } catch (error) {
      new Notice(String(error));
      this.applyButton.setDisabled(false);
    }
  }
}
