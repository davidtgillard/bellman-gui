export type DiagnosticSeverity = "error" | "warning";

export interface ContentDiagnostic {
  /** Absolute character offset (inclusive) where the problem starts. */
  from: number;
  /** Absolute character offset (exclusive) where the problem ends. */
  to: number;
  severity: DiagnosticSeverity;
  message: string;
}

export interface ContentValidationContext {
  /** Registry node type, e.g. `goal`, `project`, `milestone`, `initiative`. */
  nodeType: string;
  /** Expected node identifier segment (kebab-case) used to sanity-check the H1. */
  expectedSlug: string;
}

interface LineSpan {
  text: string;
  start: number;
  end: number;
}

function toLineSpans(text: string): LineSpan[] {
  const spans: LineSpan[] = [];
  let offset = 0;
  for (const raw of text.split("\n")) {
    spans.push({ text: raw, start: offset, end: offset + raw.length });
    offset += raw.length + 1;
  }
  return spans;
}

/**
 * Converts arbitrary heading text into a kebab-case slug for comparison against
 * a node id segment (e.g. `"Reduce churn"` -> `"reduce-churn"`).
 * @param text - Raw heading text.
 * @returns Normalized kebab-case slug.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates node markdown body content and returns ranged diagnostics suitable
 * for both a CodeMirror lint source and a plain problems list.
 * @param markdown - Full markdown source of the node body.
 * @param context - Node type and expected id slug used for convention checks.
 * @returns Diagnostics ordered by position, mixing errors and warnings.
 */
export function validateNodeMarkdown(
  markdown: string,
  context: ContentValidationContext,
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];

  if (markdown.trim().length === 0) {
    diagnostics.push({
      from: 0,
      to: markdown.length,
      severity: "error",
      message: "Content cannot be empty.",
    });
    return diagnostics;
  }

  const lines = toLineSpans(markdown);

  const firstNonEmpty = lines.find((line) => line.text.trim().length > 0);
  if (firstNonEmpty) {
    const isH1 = /^#\s+\S/.test(firstNonEmpty.text);
    if (!isH1) {
      diagnostics.push({
        from: firstNonEmpty.start,
        to: firstNonEmpty.end,
        severity: "error",
        message: 'The first line must be a level-1 heading (e.g. "# Title").',
      });
    } else {
      const headingText = firstNonEmpty.text.replace(/^#\s+/, "").trim();
      if (context.expectedSlug && slugify(headingText) !== context.expectedSlug) {
        diagnostics.push({
          from: firstNonEmpty.start,
          to: firstNonEmpty.end,
          severity: "warning",
          message: `Heading "${headingText}" doesn't match the node id "${context.expectedSlug}".`,
        });
      }
    }
  }

  for (const line of lines) {
    let idx = line.text.indexOf("](");
    while (idx !== -1) {
      const rest = line.text.slice(idx + 2);
      const close = rest.indexOf(")");
      if (close === -1) {
        diagnostics.push({
          from: line.start + idx,
          to: line.end,
          severity: "warning",
          message: "Link is missing a closing parenthesis.",
        });
      } else if (close === 0) {
        diagnostics.push({
          from: line.start + idx,
          to: line.start + idx + 3,
          severity: "warning",
          message: "Link has an empty URL.",
        });
      }
      idx = line.text.indexOf("](", idx + 2);
    }
  }

  return diagnostics.sort((a, b) => a.from - b.from);
}

/**
 * Reports whether any diagnostic is an error (which should block saving).
 * @param diagnostics - Diagnostics from {@link validateNodeMarkdown}.
 * @returns True when at least one error-severity diagnostic exists.
 */
export function hasBlockingErrors(diagnostics: ContentDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
