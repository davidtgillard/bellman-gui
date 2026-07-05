import type { ElementDefinition } from "cytoscape";
import {
  nodeLabel,
  nodeTypeColor,
  graphNodeDisplayLabel,
  type GraphLink,
  type GraphNode,
} from "./graph";
import { CYTOSCAPE_STYLESHEET } from "./cytoscape-theme";

export { CYTOSCAPE_STYLESHEET };

export interface CytoscapeGraphElements {
  nodes: ElementDefinition[];
  edges: ElementDefinition[];
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
