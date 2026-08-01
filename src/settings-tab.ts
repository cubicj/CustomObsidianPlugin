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
    this.displayNoteMaintenanceSection(containerEl);
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

  private displayNoteMaintenanceSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("노트 관리").setHeading();

    const settings = this.plugin.settings.frontmatterDates;

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
      .setName("노트 종합 정리")
      .setDesc(
        "관리 대상 노트 전체에 비어 있는 created, modified 날짜를 채운 뒤 정리 규칙을 적용합니다. 정리 규칙은 modified 날짜를 갱신하지 않습니다.",
      )
      .addButton((button) => {
        button.setButtonText("정리 실행").onClick(async () => {
          button.setDisabled(true);
          try {
            const dates = await this.plugin.frontmatterDates.backfillAll();
            const format = await this.plugin.frontmatterDates.formatAll();
            new Notice(
              `노트 종합 정리 완료: 날짜 채움 ${dates.updated}개, 서식 변경 ${format.updated}개, 실패 ${dates.failed + format.failed}개`,
            );
          } catch (error) {
            new Notice(String(error));
          } finally {
            button.setDisabled(false);
          }
        });
      });
  }
}
