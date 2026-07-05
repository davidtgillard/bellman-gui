export const LEGEND_VISIBILITY_KEY_PREFIX = "bellman:legend-visibility:";

/**
 * localStorage key for legend visibility preferences.
 * @param roadmapRoot
 * @returns Storage key string.
 */
export function legendVisibilityStorageKey(roadmapRoot: string): string {
  return `${LEGEND_VISIBILITY_KEY_PREFIX}${roadmapRoot}`;
}

/**
 * Loads stored legend visibility for a roadmap.
 * @param roadmapRoot
 * @returns Visible node types, or null when unset or invalid.
 */
export function loadLegendVisibility(roadmapRoot: string): string[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(legendVisibilityStorageKey(roadmapRoot));
    if (raw == null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 *
 * @param roadmapRoot
 * @param visibleTypes
 */
export function saveLegendVisibility(roadmapRoot: string, visibleTypes: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(
      legendVisibilityStorageKey(roadmapRoot),
      JSON.stringify([...visibleTypes].sort()),
    );
  } catch {
    // Ignore quota or privacy-mode storage failures.
  }
}

/**
 * Applies stored legend visibility for a roadmap, falling back to all available types.
 * @param availableTypes
 * @param stored
 * @returns Visible node types for the graph legend.
 */
export function resolveVisibleTypes(
  availableTypes: Iterable<string>,
  stored: string[] | null,
): Set<string> {
  const available = new Set(availableTypes);
  if (stored == null) {
    return new Set(available);
  }

  if (stored.length === 0) {
    return new Set();
  }

  const next = new Set(stored.filter((type) => available.has(type)));
  const hadStoredMatch = stored.some((type) => available.has(type));
  if (!hadStoredMatch && available.size > 0) {
    return new Set(available);
  }
  return next;
}
