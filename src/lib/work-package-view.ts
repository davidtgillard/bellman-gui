import {
  innerGraphForProject,
  nodeLabel,
  type GraphLink,
  type GraphNode,
} from "./graph";

export const OVERFLOW_NODE_PREFIX = "__overflow__:";
export const PARENT_LINK_TYPE = "parent_of";
export const HAS_SUB_PACKAGES_LABEL = "has sub-packages";

export interface CompoundWorkPackageViewNode extends GraphNode {
  parent?: string;
  isCompound?: boolean;
  subLabel?: string;
  isOverflow?: boolean;
  overflowCount?: number;
}

export interface CompoundWorkPackageView {
  displayNodes: CompoundWorkPackageViewNode[];
  displayLinks: GraphLink[];
  overflowByParent: Map<string, number>;
  childrenByParent: Map<string, string[]>;
  usesFlatFallback: boolean;
}

export interface BuildCompoundWorkPackageViewOptions {
  nodes: GraphNode[];
  links: GraphLink[];
  projectId: string;
  focusParentId?: string | null;
  maxVisibleChildren?: number;
}

/**
 * Returns whether a link represents a work-package parent relationship.
 * @param link - Graph link to inspect.
 * @returns Whether the link is a parent_of link.
 */
export function isParentLink(link: GraphLink): boolean {
  return link.linkType === PARENT_LINK_TYPE;
}

/**
 * Returns the synthetic overflow node id for a parent work package.
 * @param parentId - Parent work package node identifier.
 * @returns Overflow node identifier.
 */
export function overflowNodeId(parentId: string): string {
  return `${OVERFLOW_NODE_PREFIX}${parentId}`;
}

/**
 * Returns whether a node id is a synthetic overflow indicator.
 * @param nodeId - Node identifier to inspect.
 * @returns Whether the id denotes an overflow node.
 */
export function isOverflowNodeId(nodeId: string): boolean {
  return nodeId.startsWith(OVERFLOW_NODE_PREFIX);
}

/**
 * Returns the parent work package id encoded in an overflow node id.
 * @param nodeId - Overflow node identifier.
 * @returns Parent work package id, or null when the id is not an overflow node.
 */
export function overflowParentId(nodeId: string): string | null {
  if (!isOverflowNodeId(nodeId)) {
    return null;
  }
  return nodeId.slice(OVERFLOW_NODE_PREFIX.length);
}

/**
 * Builds parent/child maps from parent_of links scoped to a node set.
 * @param links - Graph links for the current project scope.
 * @param nodeIds - Work package node ids in scope.
 * @returns Parent and child adjacency maps.
 */
export function buildParentRelations(
  links: GraphLink[],
  nodeIds: Set<string>,
): {
  parentByChild: Map<string, string>;
  childrenByParent: Map<string, string[]>;
} {
  const parentByChild = new Map<string, string>();
  const childrenByParent = new Map<string, string[]>();

  for (const link of links) {
    if (!isParentLink(link)) {
      continue;
    }

    const parentId = link.source;
    const childId = link.target;
    if (!nodeIds.has(parentId) || !nodeIds.has(childId)) {
      continue;
    }

    parentByChild.set(childId, parentId);
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(childId);
    childrenByParent.set(parentId, siblings);
  }

  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(
      parentId,
      [...children].sort((left, right) => nodeLabel(left).localeCompare(nodeLabel(right))),
    );
  }

  return { parentByChild, childrenByParent };
}

/**
 * Returns whether parent_of links contain a cycle within the scoped node set.
 * @param parentByChild - Child to parent map.
 * @returns Whether a cycle was detected.
 */
export function hasParentCycle(parentByChild: Map<string, string>): boolean {
  for (const startId of parentByChild.keys()) {
    const visited = new Set<string>();
    let current: string | undefined = startId;
    while (current) {
      if (visited.has(current)) {
        return true;
      }
      visited.add(current);
      current = parentByChild.get(current);
    }
  }
  return false;
}

/**
 * Returns whether a work package has direct child work packages.
 * @param workPackageId - Work package node identifier.
 * @param childrenByParent - Parent to children map.
 * @returns Whether the work package has children.
 */
export function workPackageHasChildren(
  workPackageId: string,
  childrenByParent: Map<string, string[]>,
): boolean {
  return (childrenByParent.get(workPackageId)?.length ?? 0) > 0;
}

function appendOverflowNode(
  displayNodes: CompoundWorkPackageViewNode[],
  overflowByParent: Map<string, number>,
  parentId: string,
  hiddenCount: number,
): void {
  overflowByParent.set(parentId, hiddenCount);
  displayNodes.push({
    id: overflowNodeId(parentId),
    type: "work_package",
    parent: parentId,
    isOverflow: true,
    overflowCount: hiddenCount,
  });
}

function appendCompoundGroup(
  displayNodes: CompoundWorkPackageViewNode[],
  overflowByParent: Map<string, number>,
  nodesById: Map<string, GraphNode>,
  childrenByParent: Map<string, string[]>,
  parentId: string,
  childIds: string[],
  maxVisibleChildren: number,
  allowNestedCompounds: boolean,
): void {
  const parentNode = nodesById.get(parentId);
  if (!parentNode) {
    return;
  }

  displayNodes.push({ ...parentNode, isCompound: true });

  const visibleChildren = childIds.slice(0, maxVisibleChildren);
  const hiddenCount = childIds.length - visibleChildren.length;

  for (const childId of visibleChildren) {
    const childNode = nodesById.get(childId);
    if (!childNode) {
      continue;
    }

    const grandchildren = childrenByParent.get(childId) ?? [];
    if (grandchildren.length === 0) {
      displayNodes.push({ ...childNode, parent: parentId });
      continue;
    }

    if (allowNestedCompounds) {
      appendCompoundGroup(
        displayNodes,
        overflowByParent,
        nodesById,
        childrenByParent,
        childId,
        grandchildren,
        maxVisibleChildren,
        false,
      );
      continue;
    }

    displayNodes.push({
      ...childNode,
      parent: parentId,
      subLabel: HAS_SUB_PACKAGES_LABEL,
    });
  }

  if (hiddenCount > 0) {
    appendOverflowNode(displayNodes, overflowByParent, parentId, hiddenCount);
  }
}

function buildFlatFallbackView(
  scopedNodes: GraphNode[],
  scopedLinks: GraphLink[],
): CompoundWorkPackageView {
  return {
    displayNodes: scopedNodes,
    displayLinks: scopedLinks,
    overflowByParent: new Map(),
    childrenByParent: new Map(),
    usesFlatFallback: true,
  };
}

function filterDisplayLinks(
  links: GraphLink[],
  visibleNodeIds: Set<string>,
): GraphLink[] {
  return links.filter(
    (link) =>
      !isParentLink(link) &&
      visibleNodeIds.has(link.source) &&
      visibleNodeIds.has(link.target),
  );
}

/**
 * Builds a compound work-package graph view for a project or drill-down focus.
 * @param options - Project scope, focus, and display limits.
 * @returns Display nodes, links, and parent/overflow metadata.
 */
export function buildCompoundWorkPackageView(
  options: BuildCompoundWorkPackageViewOptions,
): CompoundWorkPackageView {
  const {
    nodes,
    links,
    projectId,
    focusParentId = null,
    maxVisibleChildren = 5,
  } = options;

  const scoped = innerGraphForProject(nodes, links, projectId);
  const nodeIds = new Set(scoped.nodes.map((node) => node.id));
  const nodesById = new Map(scoped.nodes.map((node) => [node.id, node]));
  const { parentByChild, childrenByParent } = buildParentRelations(scoped.links, nodeIds);

  if (hasParentCycle(parentByChild)) {
    return buildFlatFallbackView(scoped.nodes, scoped.links);
  }

  const displayNodes: CompoundWorkPackageViewNode[] = [];
  const overflowByParent = new Map<string, number>();

  if (focusParentId) {
    const directChildren = childrenByParent.get(focusParentId) ?? [];
    for (const childId of directChildren) {
      const childNode = nodesById.get(childId);
      if (!childNode) {
        continue;
      }

      const grandchildren = childrenByParent.get(childId) ?? [];
      if (grandchildren.length === 0) {
        displayNodes.push({ ...childNode });
        continue;
      }

      appendCompoundGroup(
        displayNodes,
        overflowByParent,
        nodesById,
        childrenByParent,
        childId,
        grandchildren,
        maxVisibleChildren,
        true,
      );
    }
  } else {
    const roots = scoped.nodes
      .filter((node) => !parentByChild.has(node.id))
      .sort((left, right) => nodeLabel(left.id).localeCompare(nodeLabel(right.id)));

    for (const root of roots) {
      const childIds = childrenByParent.get(root.id) ?? [];
      if (childIds.length === 0) {
        displayNodes.push({ ...root });
        continue;
      }

      appendCompoundGroup(
        displayNodes,
        overflowByParent,
        nodesById,
        childrenByParent,
        root.id,
        childIds,
        maxVisibleChildren,
        false,
      );
    }
  }

  const visibleNodeIds = new Set(displayNodes.map((node) => node.id));

  return {
    displayNodes,
    displayLinks: filterDisplayLinks(scoped.links, visibleNodeIds),
    overflowByParent,
    childrenByParent,
    usesFlatFallback: false,
  };
}

/**
 * Returns the display label for a compound or overflow node.
 * @param node - Compound view node.
 * @returns Label text for Cytoscape rendering.
 */
export function compoundNodeLabel(node: CompoundWorkPackageViewNode): string {
  if (node.isOverflow) {
    return overflowNodeLabel(node.parent ?? "", node.overflowCount ?? 0);
  }
  return nodeLabel(node.id);
}

/**
 * Returns the overflow label including hidden child count.
 * @param _parentId - Parent work package id (reserved for future use).
 * @param hiddenCount - Number of hidden children.
 * @returns Label such as "+3 more…".
 */
export function overflowNodeLabel(_parentId: string, hiddenCount: number): string {
  return `+${hiddenCount} more…`;
}

export type GraphViewFrame =
  | { kind: "top" }
  | { kind: "project"; projectId: string }
  | { kind: "work_package"; projectId: string; workPackageId: string };

/**
 * Returns whether the view stack is showing a project work-package graph.
 * @param stack - Current graph navigation stack.
 * @returns Whether a project or work-package frame is active.
 */
export function isWorkPackageGraphView(stack: GraphViewFrame[]): boolean {
  return stack.some((frame) => frame.kind === "project" || frame.kind === "work_package");
}

/**
 * Returns the active project id from the view stack.
 * @param stack - Current graph navigation stack.
 * @returns Project node id when in a work-package view.
 */
export function currentProjectId(stack: GraphViewFrame[]): string | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (frame.kind === "project" || frame.kind === "work_package") {
      return frame.projectId;
    }
  }
  return null;
}

/**
 * Returns the focused work-package id when drilled into a sub-graph.
 * @param stack - Current graph navigation stack.
 * @returns Focused work package id, or null at project root.
 */
export function currentWorkPackageFocus(stack: GraphViewFrame[]): string | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (frame.kind === "work_package") {
      return frame.workPackageId;
    }
  }
  return null;
}

/**
 * Builds breadcrumb labels for the current graph view stack.
 * @param stack - Current graph navigation stack.
 * @returns Human-readable breadcrumb segments.
 */
export function graphViewBreadcrumbLabels(stack: GraphViewFrame[]): string[] {
  const labels = ["Top level"];
  for (const frame of stack) {
    if (frame.kind === "project") {
      labels.push(`${nodeLabel(frame.projectId)} work packages`);
    } else if (frame.kind === "work_package") {
      labels.push(nodeLabel(frame.workPackageId));
    }
  }
  return labels;
}
