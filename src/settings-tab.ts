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
    new Setting(containerEl).setName("Font loader").setHeading();

    const fontSettings = this.plugin.settings.font;

    new Setting(containerEl)
      .setName("Fonts folder")
      .setDesc("Folder to look for your custom fonts")
      .addText((text) => {
        text.setPlaceholder(`${this.app.vault.configDir}/fonts/`).setValue(fontSettings.fontFolder).onChange(async (value) => {
          fontSettings.fontFolder = value;
          await this.plugin.saveSettings();
        });
      });

    const fonts = await this.plugin.fontLoader.listFonts(fontSettings.fontFolder);
    const options: Record<string, string> = { None: "None" };
    for (const f of fonts) {
      options[f] = f;
    }

    new Setting(containerEl)
      .setName("Reload fonts")
      .setDesc("Reload fonts from the specified folder")
      .addButton((btn) => {
        btn.setButtonText("Reload").onClick(async () => {
          await this.plugin.saveSettings();
          await this.plugin.fontLoader.load(fontSettings, { refreshCache: true });
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("Font")
      .setDesc("Choose a font to apply")
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
    new Setting(containerEl).setName("Frontmatter dates").setHeading();

    const settings = this.plugin.settings.frontmatterDates;

    new Setting(containerEl)
      .setName("Manage note dates")
      .setDesc("Keep created and modified frontmatter fields updated for personal notes.")
      .addToggle((toggle) => {
        toggle.setValue(settings.enabled).onChange(async (value) => {
          settings.enabled = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Managed folders")
      .setDesc("One vault-relative folder per line.")
      .addTextArea((text) => {
        text.setValue(joinPathList(settings.managedFolders)).onChange(async (value) => {
          settings.managedFolders = splitPathList(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.rows = 6;
      });

    new Setting(containerEl)
      .setName("Excluded paths")
      .setDesc("One vault-relative folder per line.")
      .addTextArea((text) => {
        text.setValue(joinPathList(settings.excludedPaths)).onChange(async (value) => {
          settings.excludedPaths = splitPathList(value);
          await this.plugin.saveSettings();
        });
        text.inputEl.rows = 6;
      });

    new Setting(containerEl)
      .setName("Backfill note dates")
      .setDesc("Fill missing created and modified fields without overwriting existing values.")
      .addButton((button) => {
        button.setButtonText("Backfill").onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await this.plugin.frontmatterDates.backfillAll();
            new Notice(
              `Backfill complete: ${result.processed} processed, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
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
    new Setting(containerEl).setName("Markdown formatting").setHeading();

    const settings = this.plugin.settings.noteFormat;

    new Setting(containerEl)
      .setName("Normalize trailing newline")
      .setDesc("Keep locally edited notes ending with exactly one final newline.")
      .addToggle((toggle) => {
        toggle.setValue(settings.normalizeTrailingNewline).onChange(async (value) => {
          settings.normalizeTrailingNewline = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Blank lines around headings")
      .setDesc("Keep one blank line before and after each heading. Code blocks and frontmatter are left alone.")
      .addToggle((toggle) => {
        toggle.setValue(settings.blankLinesAroundHeadings).onChange(async (value) => {
          settings.blankLinesAroundHeadings = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Collapse blank lines")
      .setDesc("Reduce runs of two or more blank lines to one. Code blocks are left alone.")
      .addToggle((toggle) => {
        toggle.setValue(settings.collapseBlankLines).onChange(async (value) => {
          settings.collapseBlankLines = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Blank line after heading on Enter")
      .setDesc("Pressing Enter at the end of a heading inserts one blank line and moves the cursor below it.")
      .addToggle((toggle) => {
        toggle.setValue(settings.headingEnterBlankLine).onChange(async (value) => {
          settings.headingEnterBlankLine = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Format notes")
      .setDesc("Rewrite managed notes with every enabled formatting rule. Does not update modified dates.")
      .addButton((button) => {
        button.setButtonText("Format").onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await this.plugin.frontmatterDates.formatAll();
            new Notice(
              `Format complete: ${result.processed} processed, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
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
    new Setting(containerEl).setName("Fold properties").setHeading();

    new Setting(containerEl)
      .setName("Fold properties by default")
      .setDesc("Collapse the properties block when a note opens. Expanding a note keeps it open while it stays loaded.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.foldProperties.enabled).onChange(async (value) => {
          this.plugin.settings.foldProperties.enabled = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private displayVaultReplaceSection(containerEl: HTMLElement) {
    new Setting(containerEl).setName("Vault replace").setHeading();

    new Setting(containerEl)
      .setName("Find and replace in all files")
      .setDesc("Register the vault-wide find and replace command and its Mod+Shift+H hotkey.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.vaultReplace.enabled).onChange(async (value) => {
          this.plugin.settings.vaultReplace.enabled = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
