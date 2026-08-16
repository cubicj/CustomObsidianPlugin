import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import {
  buildMatchPreview,
  buildMatcher,
  resolveReplaceSnapshot,
} from "./vault-replace-utils";
import type { ScanInput, ScanSnapshot } from "./vault-replace-utils";
import type { FileMatches, VaultReplaceManager } from "./vault-replace";

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
  private scanSnapshot: ScanSnapshot | null = null;
  private scanFailures = 0;
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
        this.invalidateSearchResults();
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
        this.invalidateSearchResults();
        this.scheduleScan();
      });
    });

    new Setting(contentEl).setName("정규식").addToggle((toggle) => {
      toggle.setValue(this.useRegex).onChange((value) => {
        this.useRegex = value;
        this.invalidateSearchResults();
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

  private currentScanInput(): ScanInput {
    return {
      query: this.findValue,
      caseSensitive: this.caseSensitive,
      useRegex: this.useRegex,
    };
  }

  private invalidateSearchResults(): void {
    this.generation++;
    this.errorMessage = "";
    this.results = [];
    this.scanSnapshot = null;
    this.scanFailures = 0;
    this.excluded.clear();
    this.render();
  }

  private async runScan(): Promise<void> {
    const generation = ++this.generation;
    const input = this.currentScanInput();
    this.errorMessage = "";
    this.results = [];
    this.scanSnapshot = null;
    this.scanFailures = 0;
    this.excluded.clear();

    if (input.query.length === 0) {
      this.render();
      return;
    }

    const matcher = buildMatcher(input.query, {
      caseSensitive: input.caseSensitive,
      useRegex: input.useRegex,
    });
    if (!matcher.ok) {
      this.errorMessage = `정규식 오류: ${matcher.error}`;
      this.render();
      return;
    }

    const scan = await this.manager.scan(matcher.regex);
    if (generation !== this.generation) {
      return;
    }
    this.scanSnapshot = { ...input, regex: matcher.regex };
    this.results = scan.results;
    this.scanFailures = scan.failed;
    this.render();
  }

  private render(): void {
    this.errorEl.setText(this.errorMessage);
    this.resultsEl.empty();

    if (this.errorMessage.length > 0 || this.scanSnapshot === null) {
      this.summaryEl.setText("");
      this.updateApplyButton();
      return;
    }

    const failureSuffix =
      this.scanFailures > 0 ? `, ${this.scanFailures}개 파일 읽기 실패` : "";
    if (this.results.length === 0) {
      this.summaryEl.setText(`일치하는 항목 없음${failureSuffix}`);
      this.updateApplyButton();
      return;
    }

    const totalMatches = this.results.reduce((sum, item) => sum + item.matches.length, 0);
    this.summaryEl.setText(
      `${this.results.length}개 파일, ${totalMatches}개 매치${failureSuffix}`,
    );

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
        const preview = buildMatchPreview(match, PREVIEW_RADIUS);
        const previewEl = fileEl.createDiv({ cls: "cubicj-vr-preview" });
        previewEl.createSpan({ text: preview.before });
        previewEl.createEl("mark", { text: preview.match });
        previewEl.createSpan({ text: preview.after });
        if (preview.additionalLines > 0) {
          previewEl.createSpan({ text: ` (${preview.additionalLines}줄 더 이어짐)` });
        }
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
    const snapshot = resolveReplaceSnapshot(this.scanSnapshot, this.currentScanInput());
    const selected = snapshot === null ? [] : this.selectedResults();
    this.applyButton.setButtonText(
      selected.length > 0 ? `${selected.length}개 파일에 적용` : "바꾸기",
    );
    this.applyButton.setDisabled(selected.length === 0);
  }

  private async runReplace(): Promise<void> {
    const snapshot = resolveReplaceSnapshot(this.scanSnapshot, this.currentScanInput());
    if (snapshot === null) {
      this.invalidateSearchResults();
      return;
    }
    const targets = this.selectedResults();
    if (targets.length === 0) {
      return;
    }
    this.applyButton.setDisabled(true);
    try {
      const result = await this.manager.replace(
        targets,
        snapshot.regex,
        this.replaceValue,
        snapshot.useRegex,
      );
      const failedSuffix = result.failed > 0 ? `, ${result.failed}개 실패` : "";
      new Notice(`${result.files}개 파일에서 ${result.matches}개 매치를 바꿨습니다${failedSuffix}`);
      this.close();
    } catch (error) {
      new Notice(String(error));
      this.updateApplyButton();
    }
  }
}
