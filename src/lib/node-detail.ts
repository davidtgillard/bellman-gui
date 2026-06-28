import { invoke } from "@tauri-apps/api/core";
import exploreMlRanking from "../fixtures/example-roadmap/initiatives/explore-ml-ranking.md?raw";
import billingRedesign from "../fixtures/example-roadmap/projects/billing-redesign/billing-redesign.md?raw";
import gaRelease from "../fixtures/example-roadmap/milestones/ga-release.md?raw";
import reduceChurn from "../fixtures/example-roadmap/goals/reduce-churn.md?raw";
import wpInvoicing from "../fixtures/example-roadmap/work-packages/billing-redesign--wp-invoicing.md?raw";
import wpPdfExport from "../fixtures/example-roadmap/work-packages/billing-redesign--wp-pdf-export.md?raw";
import { nodeLabel } from "./graph";

export interface NodeDetail {
  nodeId: string;
  nodeType: string;
  title: string;
  markdown: string;
  sourcePath: string | null;
}

interface NodeDetailDto {
  node_id: string;
  node_type: string;
  title: string;
  markdown: string;
  source_path: string | null;
}

const EXAMPLE_NODE_MARKDOWN: Record<string, string> = {
  "initiative--explore-ml-ranking": exploreMlRanking,
  "project--billing-redesign": billingRedesign,
  "billing-redesign--wp-invoicing": wpInvoicing,
  "billing-redesign--wp-pdf-export": wpPdfExport,
  "milestone--ga-release": gaRelease,
  "goal--reduce-churn": reduceChurn,
};

function fromDto(dto: NodeDetailDto): NodeDetail {
  return {
    nodeId: dto.node_id,
    nodeType: dto.node_type,
    title: dto.title,
    markdown: dto.markdown,
    sourcePath: dto.source_path,
  };
}

function exampleNodeDetail(nodeId: string, nodeType: string): NodeDetail {
  const markdown = EXAMPLE_NODE_MARKDOWN[nodeId];
  if (!markdown) {
    throw new Error(`No example markdown for node ${nodeId}`);
  }

  return {
    nodeId,
    nodeType,
    title: nodeLabel(nodeId),
    markdown,
    sourcePath: null,
  };
}

/**
 * Loads markdown detail for a roadmap node from disk or bundled fixtures.
 * @param roadmapRoot - Roadmap root path, or `example` for the bundled demo graph.
 * @param nodeId - Fully qualified node id from the registry.
 * @param nodeType - Registry node type used when serving bundled fixtures.
 * @returns Renderable node detail including markdown body text.
 */
export async function loadNodeDetail(
  roadmapRoot: string,
  nodeId: string,
  nodeType: string,
): Promise<NodeDetail> {
  if (roadmapRoot === "example") {
    return exampleNodeDetail(nodeId, nodeType);
  }

  const dto = await invoke<NodeDetailDto>("load_node_detail_command", {
    request: {
      roadmap_root: roadmapRoot,
      node_id: nodeId,
    },
  });
  return fromDto(dto);
}
