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

export interface IssueReferenceBoundaryNode {
  readonly parentElement: IssueReferenceBoundaryElement | null;
  readonly previousSibling: IssueReferenceBoundaryNode | null;
  readonly textContent: string | null;
}

export interface IssueReferenceBoundaryElement
  extends IssueReferenceBoundaryNode {
  readonly tagName: string;
}

const ISSUE_REFERENCE_PATTERN = /#\d+/gu;
const TAG_TERMINATOR_PATTERN = /[\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~\u005B\u005D\u005C\s]/u;
const READING_BLOCK_TAGS = new Set([
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "P",
  "TD",
  "TH",
]);
const CODE_BLOCK_SYNTAX_TOKENS = new Set([
  "hmd-codeblock",
  "hmd-indented-code",
]);
const EXCLUDED_SYNTAX_TOKENS = new Set([
  "comment",
  "formatting-link-string",
  "hmd-codeblock",
  "hmd-frontmatter",
  "hmd-indented-code",
  "hmd-internal-link",
  "inline-code",
  "link",
  "math",
  "url",
]);
const EXCLUDED_READING_TAGS = new Set(["A", "CODE", "PRE"]);
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

export function isIssueReferenceCodeBlockSyntaxNode(name: string): boolean {
  return name.split("_").some((token) => CODE_BLOCK_SYNTAX_TOKENS.has(token));
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

export function hasIssueReferenceBoundary(
  precedingCharacter: string | null,
): boolean {
  return precedingCharacter === null || /\s/u.test(precedingCharacter);
}

function isIssueReferenceLineBreakNode(node: IssueReferenceBoundaryNode): boolean {
  return (
    "tagName" in node && (node as IssueReferenceBoundaryElement).tagName === "BR"
  );
}

export function deriveIssueReferencePrecedingCharacter(
  node: IssueReferenceBoundaryNode,
): string | null {
  let current = node;
  for (;;) {
    let previous = current.previousSibling;
    while (previous !== null) {
      if (isIssueReferenceLineBreakNode(previous)) {
        return null;
      }
      const text = previous.textContent;
      if (text) {
        const characters = Array.from(text);
        return characters[characters.length - 1] ?? null;
      }
      previous = previous.previousSibling;
    }

    const parent = current.parentElement;
    if (parent === null || READING_BLOCK_TAGS.has(parent.tagName)) {
      return null;
    }
    current = parent;
  }
}

export function shouldSuppressIssueReferenceClickableToken(
  token: unknown,
): boolean {
  if (typeof token !== "object" || token === null) {
    return false;
  }
  const candidate = token as { type?: unknown; text?: unknown };
  return (
    candidate.type === "tag" &&
    typeof candidate.text === "string" &&
    /^#\d/u.test(candidate.text)
  );
}

export function findIssueReferences(
  text: string,
  precedingCharacter: string | null = null,
): IssueReference[] {
  const references: IssueReference[] = [];

  for (const match of text.matchAll(ISSUE_REFERENCE_PATTERN)) {
    const from = match.index;
    const effectivePrecedingCharacter =
      from > 0 ? text[from - 1] : precedingCharacter;
    if (!hasIssueReferenceBoundary(effectivePrecedingCharacter)) {
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
