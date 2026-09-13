import { nodeLabel } from "./graph";
import { isOverflowNodeId } from "./work-package-view";

/** A canvas node that may be offered as a work-package dependency. */
export interface DependencyCandidateNode {
  id: string;
  type?: string;
}

/**
 * Adds or removes a dependency title, ignoring a toggle of the origin package.
 * @param current - Draft dependency titles.
 * @param title - Title to add or remove.
 * @param originTitle - Title of the work package being edited.
 * @returns Next draft dependency titles.
 */
export function toggleDependency(
  current: readonly string[],
  title: string,
  originTitle?: string,
): string[] {
  if (originTitle && title === originTitle) {
    return [...current];
  }
  if (current.includes(title)) {
    return current.filter((item) => item !== title);
  }
  return [...current, title];
}

/**
 * Lists canvas node ids that can be toggled as dependencies.
 * @param options - Origin, available titles, and currently displayed nodes.
 * @param options.originId - Work package being edited.
 * @param options.availableTitles - Titles that may be depended on.
 * @param options.nodes - Currently displayed canvas nodes.
 * @returns Eligible node ids in display order.
 */
export function eligibleDependencyNodeIds(options: {
  originId: string;
  availableTitles: readonly string[];
  nodes: readonly DependencyCandidateNode[];
}): string[] {
  const available = new Set(options.availableTitles);
  return options.nodes
    .filter((node) => {
      if (node.id === options.originId || isOverflowNodeId(node.id)) {
        return false;
      }
      if (node.type && node.type !== "work_package") {
        return false;
      }
      return available.has(nodeLabel(node.id));
    })
    .map((node) => node.id);
}

/**
 * Maps selected dependency titles onto visible canvas node ids.
 * @param dependencies - Draft dependency titles.
 * @param nodes - Currently displayed nodes.
 * @returns Node ids whose labels are in the draft set.
 */
export function selectedDependencyNodeIds(
  dependencies: readonly string[],
  nodes: readonly DependencyCandidateNode[],
): string[] {
  const wanted = new Set(dependencies);
  return nodes
    .filter(
      (node) => !isOverflowNodeId(node.id) && wanted.has(nodeLabel(node.id)),
    )
    .map((node) => node.id);
}

/**
 * Filters available titles down to unselected matches for the Add control.
 * @param available - Titles that may be depended on, excluding the origin.
 * @param selected - Currently selected dependency titles.
 * @param query - Case-insensitive substring filter.
 * @returns Titles still available to add.
 */
export function unselectedDependencyOptions(
  available: readonly string[],
  selected: readonly string[],
  query = "",
): string[] {
  const selectedSet = new Set(selected);
  const needle = query.trim().toLowerCase();
  return available.filter((title) => {
    if (selectedSet.has(title)) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return title.toLowerCase().includes(needle);
  });
}
