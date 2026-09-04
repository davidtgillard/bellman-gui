import type { ElementDefinition } from "cytoscape";
import {
  nodeLabel,
  nodeTypeColor,
  graphNodeDisplayLabel,
  type GraphLink,
  type GraphNode,
} from "./graph";
import { CYTOSCAPE_STYLESHEET } from "./cytoscape-theme";
import { edgeDisplayData } from "./link-display";

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
        ...edgeDisplayData(link.linkType),
      },
    })),
  };
}

/**
 * Merges parsed display fields onto Cytoscape edge elements.
 * Used after compound-scene `buildElements()`, which only forwards id/source/target/label.
 * @param elements - Cytoscape node and edge definitions.
 * @param links - Source links that carry `linkType`.
 * @returns Elements with edge display data applied.
 */
export function withEdgeDisplayData(
  elements: ElementDefinition[],
  links: Array<{ id: string; linkType: string }>,
): ElementDefinition[] {
  const byId = new Map(links.map((link) => [link.id, link.linkType]));
  return elements.map((element) => {
    const data = element.data;
    if (!data || typeof data.id !== "string" || !("source" in data)) {
      return element;
    }
    const linkType = byId.get(data.id);
    if (!linkType) {
      return element;
    }
    return {
      ...element,
      data: {
        ...data,
        ...edgeDisplayData(linkType),
      },
    };
  });
}
