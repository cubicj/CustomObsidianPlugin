export interface FoldRange {
  from: number;
  to: number;
}

type FoldInfoRecord = { [key: string]: unknown };

export function injectPropertiesFold(info: unknown): FoldInfoRecord & { folds: FoldRange[] } {
  const propertiesFold: FoldRange = { from: 0, to: 0 };
  if (typeof info !== "object" || info === null) {
    return { folds: [propertiesFold] };
  }
  const record = info as FoldInfoRecord;
  const folds = Array.isArray(record.folds) ? (record.folds as FoldRange[]) : null;
  if (!folds) {
    return { ...record, folds: [propertiesFold] };
  }
  if (folds.some((fold) => fold && fold.from === 0)) {
    return { ...record, folds };
  }
  return { ...record, folds: [propertiesFold, ...folds] };
}
