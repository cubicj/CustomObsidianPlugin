import { Plugin } from "obsidian";

export interface SidebarCommandsSettings {
  enabled: boolean;
}

export const DEFAULT_SIDEBAR_COMMANDS_SETTINGS: SidebarCommandsSettings = {
  enabled: true,
};

export class SidebarCommandsManager {
  constructor(
    private plugin: Plugin,
    private getSettings: () => SidebarCommandsSettings,
  ) {}

  register(): void {
    if (!this.getSettings().enabled) {
      return;
    }
    const workspace = this.plugin.app.workspace;
    this.plugin.addCommand({
      id: "collapse-left-sidebar",
      name: "왼쪽 사이드바 접기",
      callback: () => workspace.leftSplit.collapse(),
    });
    this.plugin.addCommand({
      id: "expand-left-sidebar",
      name: "왼쪽 사이드바 펼치기",
      callback: () => workspace.leftSplit.expand(),
    });
    this.plugin.addCommand({
      id: "collapse-right-sidebar",
      name: "오른쪽 사이드바 접기",
      callback: () => workspace.rightSplit.collapse(),
    });
    this.plugin.addCommand({
      id: "expand-right-sidebar",
      name: "오른쪽 사이드바 펼치기",
      callback: () => workspace.rightSplit.expand(),
    });
  }
}
