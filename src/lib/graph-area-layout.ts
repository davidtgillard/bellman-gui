/**
 * Clamp preferred sidebar width so the graph dock keeps reserved space.
 * @param preferred - User-preferred or stored width in pixels.
 * @param maxWidthPx - Derived maximum width that leaves room for the graph.
 * @param minWidth - Preferred minimum when `maxWidthPx` allows it.
 * @returns Width to apply to the sidebar.
 */
export function clampSidebarWidth(
  preferred: number,
  maxWidthPx: number,
  minWidth: number,
): number {
  const max = Math.max(0, Math.round(maxWidthPx));
  const min = Math.min(minWidth, max);
  return Math.min(Math.max(Math.round(preferred), min), max);
}

/**
 * Max sidebar width that leaves `legendNeedWidth` for the graph dock.
 * @param graphAreaWidth - Width of the graph area flex row.
 * @param legendNeedWidth - Horizontal footprint required by the legend.
 * @returns Maximum sidebar width in pixels.
 */
export function maxSidebarWidthForLegend(
  graphAreaWidth: number,
  legendNeedWidth: number,
): number {
  return Math.max(0, Math.round(graphAreaWidth) - Math.round(legendNeedWidth));
}

/**
 * Whether the legend fits in the dock without overlapping the sidebar.
 * @param dockWidth - Current graph dock width in pixels.
 * @param legendNeedWidth - Horizontal footprint required by the legend.
 * @returns True when the legend fits inside the dock.
 */
export function legendFitsInDock(
  dockWidth: number,
  legendNeedWidth: number,
): boolean {
  return Math.round(dockWidth) >= Math.round(legendNeedWidth);
}

/**
 * Horizontal space the legend needs: left offset + border box width.
 * @param legend - Legend element to measure.
 * @returns Required width from the dock's left edge through the legend.
 */
export function measureLegendNeedWidth(legend: HTMLElement): number {
  return legend.offsetLeft + legend.offsetWidth;
}

/**
 * Derive legend footprint from `.node-legend` CSS when no legend is mounted
 * (e.g. empty types or work-package view).
 * @param container - Element that hosts absolute legend positioning.
 * @returns Required width derived from legend CSS.
 */
export function measureLegendNeedWidthFromCss(container: HTMLElement): number {
  const probe = document.createElement("aside");
  probe.className = "node-legend";
  probe.setAttribute("aria-hidden", "true");
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.position = "absolute";
  container.appendChild(probe);
  const need = measureLegendNeedWidth(probe);
  container.removeChild(probe);
  return need;
}
