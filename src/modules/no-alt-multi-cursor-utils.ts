export function decideClickAddsSelectionRange(
  enabled: boolean,
  event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean },
): boolean {
  if (enabled) {
    return false;
  }
  return event.altKey && !event.ctrlKey && !event.metaKey;
}
