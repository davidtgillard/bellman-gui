import type { ElementDefinition } from "cytoscape";
import {
  nodeLabel,
  nodeTypeColor,
  graphNodeDisplayLabel,
  type GraphLink,
  type GraphNode,
} from "./graph";
import {
  compoundNodeLabel,
  overflowNodeLabel,
  type CompoundWorkPackageViewNode,
} from "./work-package-view";
import { CYTOSCAPE_STYLESHEET } from "./cytoscape-theme";

export { CYTOSCAPE_STYLESHEET };

export interface CytoscapeGraphElements {
  nodes: ElementDefinition[];
  edges: ElementDefinition[];
}

function sortCompoundNodes(nodes: CompoundWorkPackageViewNode[]): CompoundWorkPackageViewNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sorted: CompoundWorkPackageViewNode[] = [];
  const placed = new Set<string>();

  const place = (node: CompoundWorkPackageViewNode) => {
    if (placed.has(node.id)) {
      return;
    }
    if (node.parent && byId.has(node.parent) && !placed.has(node.parent)) {
      place(byId.get(node.parent)!);
    }
    placed.add(node.id);
    sorted.push(node);
  };

  for (const node of nodes) {
    place(node);
  }

  return sorted;
}

/**
 * Maps compound work-package view nodes and links to Cytoscape elements.
 * @param nodes - Compound view nodes including parent assignments.
 * @param links - Display links excluding parent_of edges.
 * @param overflowByParent - Hidden child counts keyed by parent id.
 * @returns Cytoscape node and edge element arrays.
 */
export function toCytoscapeElementsFromCompoundNodes(
  nodes: CompoundWorkPackageViewNode[],
  links: GraphLink[],
  overflowByParent: Map<string, number> = new Map(),
): CytoscapeGraphElements {
  const sortedNodes = sortCompoundNodes(nodes);

  return {
    nodes: sortedNodes.map((node) => {
      const baseLabel = graphNodeDisplayLabel(
        node.isOverflow
          ? overflowNodeLabel(
              node.parent ?? "",
              overflowByParent.get(node.parent ?? "") ?? node.overflowCount ?? 0,
            )
          : compoundNodeLabel(node),
      );
      const label = node.subLabel
        ? `${baseLabel}\n${graphNodeDisplayLabel(node.subLabel)}`
        : baseLabel;

      return {
        data: {
          id: node.id,
          label,
          subLabel: node.subLabel,
          type: node.type,
          color: nodeTypeColor(node.type),
          parent: node.parent,
          isCompound: node.isCompound ?? false,
          isOverflow: node.isOverflow ?? false,
        },
        classes: node.isOverflow ? "overflow" : undefined,
      };
    }),
    edges: links.map((link) => ({
      data: {
        id: link.id,
        source: link.source,
        target: link.target,
        label: link.linkType,
      },
    })),
  };
}

/**
 * Maps plain roadmap graph nodes and links to Cytoscape element definitions.
 * @param nodes - Roadmap graph nodes.
 * @param links - Roadmap graph links.
 * @returns Cytoscape node and edge element arrays.
 */
export function toCytoscapeElements(
  nodes: GraphNode[],
  links: GraphLink[],
): CytoscapeGraphElements {
  return {
    nodes: nodes.map((node) => ({
      data: {
        id: node.id,
        label: graphNodeDisplayLabel(nodeLabel(node.id)),
        type: node.type,
        color: nodeTypeColor(node.type),
      },
    })),
    edges: links.map((link) => ({
      data: {
        id: link.id,
        source: link.source,
        target: link.target,
        label: link.linkType,
      },
    })),
  };
}
