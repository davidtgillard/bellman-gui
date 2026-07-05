import {
  CompoundGraphScene,
  buildLayoutModel,
  isOverflowNodeId,
  type SceneEdgeSpec,
  type SceneNodeSpec,
  type WorkPackageLayoutModel,
} from "@dgillard/cytoscape-compound-graph";
import { graphNodeDisplayLabel, nodeTypeColor } from "./graph";
import type { NodePosition } from "./graph-layout";
import type {
  CompoundWorkPackageView,
  CompoundWorkPackageViewNode,
} from "./work-package-view";
import type { GraphLink } from "./graph";

export interface CompoundGraphViewNode {
  id: string;
  label?: string;
  fill?: string;
  parent?: string;
  subLabel?: string;
  classes?: string;
  data?: { type?: string; isCompound?: boolean; isOverflow?: boolean };
}

export interface CompoundGraphViewLink {
  id: string;
  source: string;
  target: string;
  label?: string;
}

function nodeLabelText(node: CompoundGraphViewNode): string {
  const baseLabel = graphNodeDisplayLabel(node.label ?? node.id);
  return node.subLabel
    ? `${baseLabel}\n${graphNodeDisplayLabel(node.subLabel)}`
    : baseLabel;
}

function toSceneNodeSpec(
  node: CompoundGraphViewNode,
  nodePositions: Record<string, NodePosition> | undefined,
  absolutePosition: { x: number; y: number } | undefined,
): SceneNodeSpec {
  const saved = nodePositions?.[node.id];
  const isOverflow = Boolean(node.data?.isOverflow) || isOverflowNodeId(node.id);
  const isCompound = Boolean(node.data?.isCompound);

  if (isCompound) {
    return {
      id: node.id,
      label: nodeLabelText(node),
      color: node.fill ?? nodeTypeColor(node.data?.type ?? "work_package"),
      kind: "container",
      parent: node.parent,
      nodeType: node.data?.type,
      classes: node.classes,
      x: absolutePosition?.x ?? saved?.x,
      y: absolutePosition?.y ?? saved?.y,
      compoundWidth: saved?.w,
      compoundHeight: saved?.h,
    };
  }

  return {
    id: node.id,
    label: nodeLabelText(node),
    color: node.fill ?? nodeTypeColor(node.data?.type ?? "work_package"),
    kind: "leaf",
    parent: node.parent,
    isOverflow,
    nodeType: node.data?.type,
    classes: node.classes ?? (isOverflow ? "overflow" : undefined),
    x: absolutePosition?.x,
    y: absolutePosition?.y,
  };
}

function toLayoutInputs(nodes: CompoundGraphViewNode[]) {
  return nodes.map((node) => ({
    id: node.id,
    parent: node.parent,
    isCompound: node.data?.isCompound,
    isOverflow: node.data?.isOverflow,
  }));
}

function absoluteCenterFromModel(
  model: WorkPackageLayoutModel,
  nodeId: string,
): { x: number; y: number } {
  const node = model.nodes.get(nodeId);
  if (!node) {
    return { x: 0, y: 0 };
  }
  const parentId = model.parentOf.get(nodeId);
  if (!parentId) {
    return { ...node.center };
  }
  const parentCenter = absoluteCenterFromModel(model, parentId);
  return {
    x: parentCenter.x + node.center.x,
    y: parentCenter.y + node.center.y,
  };
}

function absolutePositionsForNodes(
  nodes: CompoundGraphViewNode[],
  nodePositions: Record<string, NodePosition> | undefined,
): Map<string, { x: number; y: number }> {
  if (!nodePositions) {
    return new Map();
  }
  const model = buildLayoutModel(toLayoutInputs(nodes), nodePositions);
  const positions = new Map<string, { x: number; y: number }>();
  for (const nodeId of model.nodes.keys()) {
    positions.set(nodeId, absoluteCenterFromModel(model, nodeId));
  }
  return positions;
}

function toSceneEdges(links: CompoundGraphViewLink[]): SceneEdgeSpec[] {
  return links.map((link) => ({
    id: link.id,
    source: link.source,
    target: link.target,
    label: link.label,
  }));
}

/**
 * Builds a {@link CompoundGraphScene} from work-package graph view nodes and saved layout.
 * @param nodes
 * @param links
 * @param nodePositions
 * @returns Compound graph scene for the view.
 */
export function buildCompoundGraphScene(
  nodes: CompoundGraphViewNode[],
  links: CompoundGraphViewLink[],
  nodePositions: Record<string, NodePosition> | undefined,
): CompoundGraphScene {
  const absolutePositions = absolutePositionsForNodes(nodes, nodePositions);
  const sceneNodes = nodes.map((node) =>
    toSceneNodeSpec(node, nodePositions, absolutePositions.get(node.id)),
  );
  return CompoundGraphScene.fromSpec({
    nodes: sceneNodes,
    edges: toSceneEdges(links),
  });
}

/**
 * Builds a scene from a {@link CompoundWorkPackageView} and display node metadata.
 * @param view
 * @param displayNodes
 * @param nodePositions
 * @param labelForNode
 * @returns Compound graph scene for the work-package view.
 */
export function buildCompoundGraphSceneFromView(
  view: CompoundWorkPackageView,
  displayNodes: CompoundWorkPackageViewNode[],
  nodePositions: Record<string, NodePosition> | undefined,
  labelForNode: (node: CompoundWorkPackageViewNode) => string,
): CompoundGraphScene {
  const graphNodes: CompoundGraphViewNode[] = displayNodes.map((node) => ({
    id: node.id,
    label: labelForNode(node),
    fill: nodeTypeColor(node.type),
    parent: node.parent,
    subLabel: node.subLabel,
    classes: node.isOverflow ? "overflow" : undefined,
    data: {
      type: node.type,
      isCompound: node.isCompound,
      isOverflow: node.isOverflow,
    },
  }));
  return buildCompoundGraphScene(graphNodes, view.displayLinks, nodePositions);
}

/**
 * Whether the node list uses compound parent/child layout.
 * @param nodes
 * @returns True when any node is compound or has a parent.
 */
export function isCompoundGraphNodes(nodes: CompoundGraphViewNode[]): boolean {
  return nodes.some((node) => Boolean(node.parent || node.data?.isCompound));
}

/**
 * Layout model inputs derived from compound graph nodes.
 * @param nodes
 * @returns Layout inputs for the compound graph scene.
 */
export function sceneLayoutInputs(nodes: CompoundGraphViewNode[]) {
  return toLayoutInputs(nodes);
}

export type { GraphLink };
