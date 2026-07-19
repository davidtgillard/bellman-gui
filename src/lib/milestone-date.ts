/**
 * Extracts the milestone date label from markdown under a `## Date` heading.
 * Prefers a `YYYY-MM-DD` token when present; otherwise returns the first
 * non-empty content line. Returns null when no date section or value exists.
 * @param markdown - Full milestone markdown body.
 * @returns Display date string, or null when absent.
 */
export function parseMilestoneDate(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  let inDateSection = false;

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const title = heading[1]?.trim().toLowerCase() ?? "";
      if (inDateSection) {
        break;
      }
      inDateSection = title === "date";
      continue;
    }

    if (!inDateSection) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const isoMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    return isoMatch?.[1] ?? trimmed;
  }

  return null;
}
