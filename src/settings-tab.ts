import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type CubicJCorePlugin from "./main";
import { joinPathList, splitPathList } from "./modules/frontmatter-date-utils";

export class CubicJCoreSettingTab extends PluginSettingTab {
  plugin: CubicJCorePlugin;

  constructor(app: App, plugin: CubicJCorePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();
    await this.displayFontSection(containerEl);
    this.displayFrontmatterDatesSection(containerEl);
    this.displayNoteFormatSection(containerEl);
    this.displayFoldPropertiesSection(containerEl);
    this.displayVaultReplaceSection(containerEl);
  }

  private async displayFontSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("폰트 로더").setHeading();

    const fontSettings = this.plugin.settings.font;

    new Setting(containerEl)
      .setName("폰트 폴더")
      .setDesc("사용자 폰트를 찾을 폴더입니다.")
      .addText((text) => {
        text.setPlaceholder(`${this.app.vault.configDir}/fonts/`).setValue(fontSettings.fontFolder).onChange(async (value) => {
          fontSettings.fontFolder = value;
          await this.plugin.saveSettings();
        });
      });

    const fonts = await this.plugin.fontLoader.listFonts(fontSettings.fontFolder);
    const options: Record<string, string> = { None: "없음" };
    for (const f of fonts) {
      options[f] = f;
    }

    new Setting(containerEl)
      .setName("폰트 새로고침")
      .setDesc("지정한 폴더에서 폰트를 다시 읽어옵니다.")
      .addButton((btn) => {
        btn.setButtonText("새로고침").onClick(async () => {
          await this.plugin.saveSettings();
          await this.plugin.fontLoader.load(fontSettings, { refreshCache: true });
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("폰트")
      .setDesc("적용할 폰트를 선택합니다.")
      .addDropdown((dd) => {
        for (const [value, label] of Object.entries(options)) {
          dd.addOption(value, label);
        }
        dd.setValue(fontSettings.fontFile).onChange(async (value) => {
          fontSettings.fontFile = value;
          await this.plugin.saveSettings();
          await this.plugin.fontLoader.load(fontSettings);
          this.display();
        });
      });
  }

  private displayFrontmatterDatesSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("프론트매터 날짜").setHeading();

    const settings = this.plugin.settings.frontmatterDates;

    new Setting(containerEl)
      .setName("노트 날짜 관리")
      .setDesc("개인 노트의 created, modified 프론트매터 필드를 자동으로 갱신합니다.")
      .addToggle((toggle) => {
        toggle.setValue(settings.enabled).onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("관리 폴더")
      .setDesc("볼트 기준 상대 경로를 한 줄에 하나씩 적습니다.")
      .addTextArea((text) => {
        text.setValue(joinPathList(settings.managedFolders)).onChange(async (value) => {
          settings.managedFolders = splitPathList(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.rows = 6;
      });

    new Setting(containerEl)
      .setName("제외 경로")
      .setDesc("볼트 기준 상대 경로를 한 줄에 하나씩 적습니다.")
      .addTextArea((text) => {
        text.setValue(joinPathList(settings.excludedPaths)).onChange(async (value) => {
          settings.excludedPaths = splitPathList(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.rows = 6;
      });

    new Setting(containerEl)
      .setName("노트 날짜 채우기")
      .setDesc("created, modified 필드가 비어 있는 노트만 채우고 기존 값은 건드리지 않습니다.")
      .addButton((button) => {
        button.setButtonText("채우기").onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await this.plugin.frontmatterDates.backfillAll();
            new Notice(
              `날짜 채우기 완료: 대상 ${result.processed}개, 변경 ${result.updated}개, 건너뜀 ${result.skipped}개, 실패 ${result.failed}개`,
            );
          } catch (error) {
            new Notice(String(error));
          } finally {
            button.setDisabled(false);
          }
        });
      });
  }

  private displayNoteFormatSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("마크다운 정리").setHeading();

    const settings = this.plugin.settings.noteFormat;

    new Setting(containerEl)
      .setName("문서 끝 빈 줄 정리")
      .setDesc("로컬에서 편집한 노트가 마지막에 빈 줄 하나로 끝나도록 맞춥니다.")
      .addToggle((toggle) => {
        toggle.setValue(settings.normalizeTrailingNewline).onChange(async (value) => {
          settings.normalizeTrailingNewline = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("헤딩을 빈 줄로 감싸기")
      .setDesc("헤딩 앞뒤에 빈 줄을 하나씩 둡니다. 코드 블록과 프론트매터는 건드리지 않습니다.")
      .addToggle((toggle) => {
        toggle.setValue(settings.blankLinesAroundHeadings).onChange(async (value) => {
          settings.blankLinesAroundHeadings = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("연속 빈 줄 합치기")
      .setDesc("빈 줄이 두 줄 이상 이어지면 한 줄로 줄입니다. 코드 블록은 건드리지 않습니다.")
      .addToggle((toggle) => {
        toggle.setValue(settings.collapseBlankLines).onChange(async (value) => {
          settings.collapseBlankLines = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("헤딩에서 Enter 시 빈 줄 넣기")
      .setDesc("헤딩 줄 끝에서 Enter를 누르면 빈 줄을 하나 넣고 커서를 그 아래로 옮깁니다.")
      .addToggle((toggle) => {
        toggle.setValue(settings.headingEnterBlankLine).onChange(async (value) => {
          settings.headingEnterBlankLine = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("노트 정리 실행")
      .setDesc("켜져 있는 정리 규칙을 관리 대상 노트 전체에 적용합니다. modified 날짜는 갱신하지 않습니다.")
      .addButton((button) => {
        button.setButtonText("정리").onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await this.plugin.frontmatterDates.formatAll();
            new Notice(
              `노트 정리 완료: 대상 ${result.processed}개, 변경 ${result.updated}개, 건너뜀 ${result.skipped}개, 실패 ${result.failed}개`,
            );
          } catch (error) {
            new Notice(String(error));
          } finally {
            button.setDisabled(false);
          }
        });
      });
  }

  private displayFoldPropertiesSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("속성 접기").setHeading();

    new Setting(containerEl)
      .setName("속성 기본 접기")
      .setDesc("노트를 열 때 속성 블록을 접은 상태로 표시합니다. 직접 펼치면 노트가 열려 있는 동안 유지됩니다.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.foldProperties.enabled).onChange(async (value) => {
          this.plugin.settings.foldProperties.enabled = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private displayVaultReplaceSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("전체 파일 찾아 바꾸기").setHeading();

    new Setting(containerEl)
      .setName("찾아 바꾸기 명령 사용")
      .setDesc("전체 파일 찾아 바꾸기 명령과 Mod+Shift+H 단축키를 등록합니다.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.vaultReplace.enabled).onChange(async (value) => {
          this.plugin.settings.vaultReplace.enabled = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
