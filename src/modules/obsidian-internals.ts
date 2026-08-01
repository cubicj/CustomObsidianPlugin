import type { TFile } from "obsidian";

export type FoldManagerLoad = (file: TFile | null) => unknown;

export interface FoldManagerLike {
  load?: FoldManagerLoad;
}

export interface AppWithFoldManager {
  foldManager?: FoldManagerLike;
}
