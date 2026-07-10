export class ViewFoldTracker {
  private foldedPathByView = new WeakMap<object, string>();

  shouldFold(view: object, path: string): boolean {
    return this.foldedPathByView.get(view) !== path;
  }

  markFolded(view: object, path: string): void {
    this.foldedPathByView.set(view, path);
  }
}
