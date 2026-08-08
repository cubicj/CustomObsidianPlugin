import type { TFile } from "obsidian";

export type FoldManagerLoad = (file: TFile | null) => unknown;

export type FoldManagerSave = (file: TFile | null, info: unknown) => unknown;

export interface FoldManagerLike {
  load?: FoldManagerLoad;
  save?: FoldManagerSave;
}

export interface AppWithFoldManager {
  foldManager?: FoldManagerLike;
}
