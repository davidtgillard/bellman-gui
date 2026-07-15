import exploreMlRanking from "../fixtures/example-roadmap/initiatives/explore-ml-ranking.md?raw";
import billingRedesign from "../fixtures/example-roadmap/projects/billing-redesign/billing-redesign.md?raw";
import gaRelease from "../fixtures/example-roadmap/milestones/ga-release.md?raw";
import reduceChurn from "../fixtures/example-roadmap/goals/reduce-churn.md?raw";
import { invoke } from "@tauri-apps/api/core";
import { fromRoadmapGraphDto, type RoadmapGraph, type RoadmapGraphDto } from "./graph";
import { nodeLabel } from "./graph";

export interface WorkPackageDetail {
  project: string;
  title: string;
  description: string;
  dependencies: string[];
  availableTitles: string[];
}

export interface NodeDetail {
  nodeId: string;
  nodeType: string;
  title: string;
  markdown: string;
  sourcePath: string | null;
  workPackage: WorkPackageDetail | null;
}

export interface DependencyWarning {
  line: number | null;
  message: string;
}

export interface SaveNodeMarkdownResult {
  detail: NodeDetail;
  graph: RoadmapGraph | null;
  dependencyWarnings: DependencyWarning[];
  syncSkipped: boolean;
}

interface WorkPackageDetailDto {
  project: string;
  title: string;
  description: string;
  dependencies: string[];
  available_titles: string[];
}

interface NodeDetailDto {
  node_id: string;
  node_type: string;
  title: string;
  markdown: string;
  source_path: string | null;
  work_package: WorkPackageDetailDto | null;
}

interface DependencyWarningDto {
  line: number | null;
  message: string;
}

interface SaveNodeMarkdownResponseDto {
  detail: NodeDetailDto;
  graph: RoadmapGraphDto | null;
  dependency_warnings: DependencyWarningDto[];
  sync_skipped: boolean;
}

const WP_INVOICING_MARKDOWN = `# wp-invoicing

Core invoicing flow.`;

const WP_PDF_EXPORT_MARKDOWN = `# wp-pdf-export

PDF generation and delivery.

## Dependencies

- wp-invoicing`;

const EXAMPLE_NODE_MARKDOWN: Record<string, string> = {
  "initiative/explore-ml-ranking": exploreMlRanking,
  "project/billing-redesign": billingRedesign,
  "project/billing-redesign/wp-invoicing": WP_INVOICING_MARKDOWN,
  "project/billing-redesign/wp-pdf-export": WP_PDF_EXPORT_MARKDOWN,
  "milestone/ga-release": gaRelease,
  "goal/reduce-churn": reduceChurn,
};

function fromDto(dto: NodeDetailDto): NodeDetail {
  return {
    nodeId: dto.node_id,
    nodeType: dto.node_type,
    title: dto.title,
    markdown: dto.markdown,
    sourcePath: dto.source_path,
    workPackage: dto.work_package
      ? {
          project: dto.work_package.project,
          title: dto.work_package.title,
          description: dto.work_package.description,
          dependencies: dto.work_package.dependencies,
          availableTitles: dto.work_package.available_titles,
        }
      : null,
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
    workPackage: null,
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

/**
 * Saves markdown, runs bellman validate/sync, and returns refreshed detail plus
 * an updated graph when sync succeeds.
 * @param roadmapRoot - Editable roadmap root path.
 * @param nodeId - Fully qualified node id from the registry.
 * @param markdown - New markdown body to persist.
 * @returns Save result with optional graph and dependency warnings.
 */
export async function saveNodeMarkdown(
  roadmapRoot: string,
  nodeId: string,
  markdown: string,
): Promise<SaveNodeMarkdownResult> {
  const dto = await invoke<SaveNodeMarkdownResponseDto>("save_node_markdown_command", {
    roadmapRoot,
    nodeId,
    markdown,
  });

  return {
    detail: fromDto(dto.detail),
    graph: dto.graph ? fromRoadmapGraphDto(dto.graph) : null,
    dependencyWarnings: dto.dependency_warnings.map((warning) => ({
      line: warning.line,
      message: warning.message,
    })),
    syncSkipped: dto.sync_skipped,
  };
}
