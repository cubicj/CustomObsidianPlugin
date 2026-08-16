export interface StandaloneIssueReference {
  kind: "standalone";
  from: number;
  to: number;
}

export interface DigitLedTagIssueReference {
  kind: "digit-led-tag";
  from: number;
  to: number;
  tailFrom: number;
  tailTo: number;
}

export type IssueReference = StandaloneIssueReference | DigitLedTagIssueReference;

const ISSUE_REFERENCE_PATTERN = /#\d+/gu;
const TAG_TERMINATOR_PATTERN = /[\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~\u005B\u005D\u005C\s]/u;
const EXCLUDED_SYNTAX_TOKENS = new Set([
  "comment",
  "formatting-link-string",
  "hmd-codeblock",
  "hmd-frontmatter",
  "inline-code",
  "line-HyperMD-codeblock",
  "math",
  "url",
]);
const EXCLUDED_READING_TAGS = new Set(["CODE", "PRE"]);
const EXCLUDED_READING_CLASSES = new Set([
  "cubicj-issue-ref",
  "frontmatter",
  "math",
  "metadata-container",
  "metadata-properties",
]);

export function isIssueReferenceTagCharacter(character: string): boolean {
  return Array.from(character).length === 1 && !TAG_TERMINATOR_PATTERN.test(character);
}

export function isIssueReferenceExcludedSyntaxNode(name: string): boolean {
  return name.split("_").some((token) => EXCLUDED_SYNTAX_TOKENS.has(token));
}

export function isIssueReferenceExcludedReadingElement(
  tagName: string,
  classNames: readonly string[],
): boolean {
  if (EXCLUDED_READING_TAGS.has(tagName.toUpperCase())) {
    return true;
  }
  return classNames.some((className) => EXCLUDED_READING_CLASSES.has(className));
}

export function findIssueReferences(text: string): IssueReference[] {
  const references: IssueReference[] = [];

  for (const match of text.matchAll(ISSUE_REFERENCE_PATTERN)) {
    const from = match.index;
    if (from > 0 && !/\s/u.test(text[from - 1])) {
      continue;
    }

    const to = from + match[0].length;
    const nextCodePoint = text.codePointAt(to);
    if (nextCodePoint === undefined) {
      references.push({ kind: "standalone", from, to });
      continue;
    }

    const nextCharacter = String.fromCodePoint(nextCodePoint);
    if (!isIssueReferenceTagCharacter(nextCharacter)) {
      references.push({ kind: "standalone", from, to });
      continue;
    }

    let tailTo = to;
    while (tailTo < text.length) {
      const codePoint = text.codePointAt(tailTo);
      if (codePoint === undefined) {
        break;
      }
      const character = String.fromCodePoint(codePoint);
      if (!isIssueReferenceTagCharacter(character)) {
        break;
      }
      tailTo += character.length;
    }
    references.push({
      kind: "digit-led-tag",
      from,
      to,
      tailFrom: to,
      tailTo,
    });
  }

  return references;
}
