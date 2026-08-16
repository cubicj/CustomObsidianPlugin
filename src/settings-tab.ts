import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { DropdownComponent, SettingDefinitionItem } from "obsidian";
import type CubicJCorePlugin from "./main";
import { joinPathList, splitPathList } from "./modules/frontmatter-date-utils";

const FONT_FOLDER_NAME = "폰트 폴더";
const FONT_FOLDER_DESC = "사용자 폰트를 찾을 폴더입니다.";
const FONT_REFRESH_NAME = "폰트 새로고침";
const FONT_REFRESH_DESC = "지정한 폴더에서 폰트를 다시 읽어옵니다.";
const FONT_NAME = "폰트";
const FONT_DESC = "적용할 폰트를 선택합니다.";
const MANAGED_FOLDERS_NAME = "관리 폴더";
const MANAGED_FOLDERS_DESC = "볼트 기준 상대 경로를 한 줄에 하나씩 적습니다.";
const EXCLUDED_PATHS_NAME = "제외 경로";
const EXCLUDED_PATHS_DESC = "볼트 기준 상대 경로를 한 줄에 하나씩 적습니다.";
const NOTE_MAINTENANCE_NAME = "노트 종합 정리";
const NOTE_MAINTENANCE_DESC =
  "관리 대상 노트 전체에 비어 있는 created, modified 날짜를 채운 뒤 정리 규칙을 적용합니다. 정리 규칙은 modified 날짜를 갱신하지 않습니다.";

export class CubicJCoreSettingTab extends PluginSettingTab {
  plugin: CubicJCorePlugin;

  constructor(app: App, plugin: CubicJCorePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "폰트 로더",
        items: [
          {
            name: FONT_FOLDER_NAME,
            desc: FONT_FOLDER_DESC,
            render: (setting) => this.addFontFolder(setting),
          },
          {
            name: FONT_REFRESH_NAME,
            desc: FONT_REFRESH_DESC,
            render: (setting) => this.addFontRefresh(setting),
          },
          {
            name: FONT_NAME,
            desc: FONT_DESC,
            render: (setting) => this.addFontSelect(setting),
          },
        ],
      },
      {
        type: "group",
        heading: "노트 관리",
        items: [
          {
            name: MANAGED_FOLDERS_NAME,
            desc: MANAGED_FOLDERS_DESC,
            render: (setting) => this.addManagedFolders(setting),
          },
          {
            name: EXCLUDED_PATHS_NAME,
            desc: EXCLUDED_PATHS_DESC,
            render: (setting) => this.addExcludedPaths(setting),
          },
          {
            name: NOTE_MAINTENANCE_NAME,
            desc: NOTE_MAINTENANCE_DESC,
            render: (setting) => this.addNoteMaintenance(setting),
          },
        ],
      },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("폰트 로더").setHeading();
    this.addFontFolder(
      new Setting(containerEl).setName(FONT_FOLDER_NAME).setDesc(FONT_FOLDER_DESC),
    );
    this.addFontRefresh(
      new Setting(containerEl).setName(FONT_REFRESH_NAME).setDesc(FONT_REFRESH_DESC),
    );
    this.addFontSelect(
      new Setting(containerEl).setName(FONT_NAME).setDesc(FONT_DESC),
    );

    new Setting(containerEl).setName("노트 관리").setHeading();
    this.addManagedFolders(
      new Setting(containerEl)
        .setName(MANAGED_FOLDERS_NAME)
        .setDesc(MANAGED_FOLDERS_DESC),
    );
    this.addExcludedPaths(
      new Setting(containerEl)
        .setName(EXCLUDED_PATHS_NAME)
        .setDesc(EXCLUDED_PATHS_DESC),
    );
    this.addNoteMaintenance(
      new Setting(containerEl)
        .setName(NOTE_MAINTENANCE_NAME)
        .setDesc(NOTE_MAINTENANCE_DESC),
    );
  }

  private addFontFolder(setting: Setting): void {
    const fontSettings = this.plugin.settings.font;
    setting.addText((text) => {
      text
        .setPlaceholder(`${this.app.vault.configDir}/fonts/`)
        .setValue(fontSettings.fontFolder)
        .onChange(async (value) => {
          fontSettings.fontFolder = value;
          await this.plugin.saveSettings();
        });
    });
  }

  private addFontRefresh(setting: Setting): void {
    const fontSettings = this.plugin.settings.font;
    setting.addButton((button) => {
      button.setButtonText("새로고침").onClick(async () => {
        await this.plugin.saveSettings();
        await this.plugin.fontLoader.load(fontSettings, { refreshCache: true });
        this.rerender();
      });
    });
  }

  private addFontSelect(setting: Setting): void {
    const fontSettings = this.plugin.settings.font;
    setting.addDropdown((dropdown) => {
      dropdown.addOption("None", "없음");
      if (fontSettings.fontFile !== "None") {
        dropdown.addOption(fontSettings.fontFile, fontSettings.fontFile);
      }
      dropdown.setValue(fontSettings.fontFile).onChange(async (value) => {
        fontSettings.fontFile = value;
        await this.plugin.saveSettings();
        await this.plugin.fontLoader.load(fontSettings);
        this.rerender();
      });
      void this.populateFontOptions(
        dropdown,
        fontSettings.fontFolder,
        fontSettings.fontFile,
      );
    });
  }

  private async populateFontOptions(
    dropdown: DropdownComponent,
    fontFolder: string,
    selectedFont: string,
  ): Promise<void> {
    const fonts = await this.plugin.fontLoader.listFonts(fontFolder);
    for (const font of fonts) {
      if (font !== selectedFont) {
        dropdown.addOption(font, font);
      }
    }
    dropdown.setValue(this.plugin.settings.font.fontFile);
  }

  private addManagedFolders(setting: Setting): void {
    const settings = this.plugin.settings.frontmatterDates;
    setting.addTextArea((text) => {
      text.setValue(joinPathList(settings.managedFolders)).onChange(async (value) => {
        settings.managedFolders = splitPathList(value);
        await this.plugin.saveSettings();
      });
      text.inputEl.rows = 6;
    });
  }

  private addExcludedPaths(setting: Setting): void {
    const settings = this.plugin.settings.frontmatterDates;
    setting.addTextArea((text) => {
      text.setValue(joinPathList(settings.excludedPaths)).onChange(async (value) => {
        settings.excludedPaths = splitPathList(value);
        await this.plugin.saveSettings();
      });
      text.inputEl.rows = 6;
    });
  }

  private addNoteMaintenance(setting: Setting): void {
    setting.addButton((button) => {
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

  private rerender(): void {
    const settingTab = this as unknown as { update?: () => void; display(): void };
    if (settingTab.update) {
      settingTab.update();
    } else {
      settingTab.display();
    }
  }
}
