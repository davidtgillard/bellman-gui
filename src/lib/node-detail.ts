import exploreMlRanking from "../fixtures/example-roadmap/initiatives/explore-ml-ranking.md?raw";
import billingRedesign from "../fixtures/example-roadmap/projects/billing-redesign/billing-redesign.md?raw";
import gaRelease from "../fixtures/example-roadmap/milestones/ga-release.md?raw";
import { invoke } from "@tauri-apps/api/core";
import { fromRoadmapGraphDto, type RoadmapGraph, type RoadmapGraphDto } from "./graph";
import { nodeLabel } from "./graph";
import {
  fromEstimateWire,
  toEstimateWire,
  type WorkPackageEstimate,
  type WorkPackageEstimateWire,
} from "./work-package-estimate";
import {
  parseAttributeDefinition,
  splitClassifications,
  type AttributeAssignment,
  type AttributeDefinition,
} from "./attributes";
import goalJsonc from "../fixtures/example-roadmap/attributes/goal.jsonc?raw";
import priorityJsonc from "../fixtures/example-roadmap/attributes/priority.jsonc?raw";
import programJsonc from "../fixtures/example-roadmap/attributes/program.jsonc?raw";

interface WorkPackageBase {
  project: string;
  title: string;
  description: string;
  dependencies: string[];
  availableTitles: string[];
}

export type LeafWorkPackageDetail = WorkPackageBase & {
  role: "leaf";
  estimate: WorkPackageEstimate;
};

export type ParentWorkPackageDetail = WorkPackageBase & {
  role: "parent";
};

export type WorkPackageDetail = LeafWorkPackageDetail | ParentWorkPackageDetail;

export interface NodeDetail {
  nodeId: string;
  nodeType: string;
  title: string;
  markdown: string;
  sourcePath: string | null;
  workPackage: WorkPackageDetail | null;
  catalog: AttributeDefinition[];
  classifications: AttributeAssignment[];
}

export interface DependencyWarning {
  line: number | null;
  message: string;
}

export interface SaveNodeMarkdownResult {
  detail: NodeDetail;
  graph: RoadmapGraph | null;
  dependencyWarnings: DependencyWarning[];
  otherIssues: DependencyWarning[];
  syncSkipped: boolean;
}

export interface SaveWorkPackageResult {
  detail: NodeDetail;
  graph: RoadmapGraph | null;
  dependencyWarnings: DependencyWarning[];
  otherIssues: DependencyWarning[];
  syncSkipped: boolean;
}

interface WorkPackageBaseDto {
  project: string;
  title: string;
  description: string;
  dependencies: string[];
  available_titles: string[];
}

export type WorkPackageDetailDto =
  | (WorkPackageBaseDto & {
      role: "leaf";
      estimate: WorkPackageEstimateWire;
    })
  | (WorkPackageBaseDto & {
      role: "parent";
    });

interface AttributeAssignmentDto {
  name: string;
  value: AttributeAssignment["value"];
  payload?: Record<string, string | number | boolean>;
  pinned_version?: string | null;
}

interface AttributeDefinitionDto {
  name: string;
  version: string;
  description?: string;
  applies_to: string[];
  cardinality: "one" | "many";
  required?: boolean;
  values?: AttributeDefinition["values"];
  value_schema?: Record<string, unknown> | null;
  assignment_schema?: Record<string, unknown> | null;
}

export interface NodeDetailDto {
  node_id: string;
  node_type: string;
  title: string;
  markdown: string;
  source_path: string | null;
  work_package: WorkPackageDetailDto | null;
  catalog?: AttributeDefinitionDto[];
  classifications?: AttributeAssignmentDto[];
}

interface DependencyWarningDto {
  line: number | null;
  message: string;
}

interface SaveNodeMarkdownResponseDto {
  detail: NodeDetailDto;
  graph: RoadmapGraphDto | null;
  dependency_warnings: DependencyWarningDto[];
  other_issues?: DependencyWarningDto[];
  sync_skipped: boolean;
}

interface SaveWorkPackageResponseDto {
  detail: NodeDetailDto;
  graph: RoadmapGraphDto | null;
  dependency_warnings: DependencyWarningDto[];
  other_issues?: DependencyWarningDto[];
  sync_skipped: boolean;
}

const WP_INVOICING_MARKDOWN = `# wp-invoicing

Core invoicing flow.`;

const WP_PDF_EXPORT_MARKDOWN = `# wp-pdf-export

PDF generation and delivery.

## Dependencies

- wp-invoicing`;

const EXAMPLE_CATALOG = [priorityJsonc, goalJsonc, programJsonc]
  .map((text) => parseAttributeDefinition(text))
  .filter((item): item is AttributeDefinition => item !== null);

function definitionFromDto(dto: AttributeDefinitionDto): AttributeDefinition {
  return {
    name: dto.name,
    version: dto.version,
    description: dto.description ?? "",
    appliesTo: dto.applies_to ?? [],
    cardinality: dto.cardinality === "many" ? "many" : "one",
    required: dto.required === true,
    values: dto.values ?? null,
    valueSchema: dto.value_schema ?? null,
    assignmentSchema: dto.assignment_schema ?? null,
  };
}

function assignmentFromDto(dto: AttributeAssignmentDto): AttributeAssignment {
  return {
    name: dto.name,
    value: dto.value,
    payload: dto.payload ?? {},
    pinnedVersion: dto.pinned_version ?? null,
  };
}

const EXAMPLE_NODE_MARKDOWN: Record<string, string> = {
  "initiative/explore-ml-ranking": exploreMlRanking,
  "project/billing-redesign": billingRedesign,
  "project/billing-redesign/wp-invoicing": WP_INVOICING_MARKDOWN,
  "project/billing-redesign/wp-pdf-export": WP_PDF_EXPORT_MARKDOWN,
  "milestone/ga-release": gaRelease,
};

/**
 * Maps a work-package DTO onto the domain leaf/parent split.
 * Parent DTOs never carry an estimate; leaf `"unknown"` becomes `None`.
 * @param dto - Wire work-package payload from Tauri.
 * @returns Domain work-package detail.
 */
export function workPackageDetailFromDto(
  dto: WorkPackageDetailDto,
): WorkPackageDetail {
  const base: WorkPackageBase = {
    project: dto.project,
    title: dto.title,
    description: dto.description,
    dependencies: dto.dependencies,
    availableTitles: dto.available_titles,
  };
  if (dto.role === "parent") {
    return { ...base, role: "parent" };
  }
  return { ...base, role: "leaf", estimate: fromEstimateWire(dto.estimate) };
}

/**
 * Maps a node-detail DTO onto the domain model.
 * @param dto - Wire payload from Tauri.
 * @returns Domain node detail.
 * @throws {Error} When the payload is missing.
 */
export function nodeDetailFromDto(dto: NodeDetailDto): NodeDetail {
  if (!dto) {
    throw new Error("node detail payload was empty");
  }
  return {
    nodeId: dto.node_id,
    nodeType: dto.node_type,
    title: dto.title,
    markdown: dto.markdown,
    sourcePath: dto.source_path,
    workPackage: dto.work_package
      ? workPackageDetailFromDto(dto.work_package)
      : null,
    catalog: (dto.catalog ?? []).map(definitionFromDto),
    classifications: (dto.classifications ?? []).map(assignmentFromDto),
  };
}

function exampleNodeDetail(nodeId: string, nodeType: string): NodeDetail {
  const markdown = EXAMPLE_NODE_MARKDOWN[nodeId];
  if (!markdown) {
    throw new Error(`No example markdown for node ${nodeId}`);
  }
  const split = splitClassifications(markdown);

  return {
    nodeId,
    nodeType,
    title: nodeLabel(nodeId),
    markdown,
    sourcePath: null,
    workPackage: null,
    catalog: EXAMPLE_CATALOG,
    classifications: split.assignments,
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
  return nodeDetailFromDto(dto);
}

/**
 * Loads attribute definitions for the open roadmap.
 * @param roadmapRoot - Roadmap root, or `"example"` for the bundled catalog.
 * @returns Parsed attribute catalog. Invalid files are omitted.
 */
export async function loadAttributeCatalog(
  roadmapRoot: string,
): Promise<AttributeDefinition[]> {
  if (roadmapRoot === "example") {
    return EXAMPLE_CATALOG;
  }
  const dto = await invoke<AttributeDefinitionDto[]>("load_attribute_catalog_command", {
    roadmapRoot,
  });
  return dto.map(definitionFromDto);
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
    detail: nodeDetailFromDto(dto.detail),
    graph: dto.graph ? fromRoadmapGraphDto(dto.graph) : null,
    dependencyWarnings: dto.dependency_warnings.map((warning) => ({
      line: warning.line,
      message: warning.message,
    })),
    otherIssues: (dto.other_issues ?? []).map((warning) => ({
      line: warning.line,
      message: warning.message,
    })),
    syncSkipped: dto.sync_skipped,
  };
}

/**
 * Updates a work package, runs bellman validate/sync, and returns refreshed
 * detail plus an updated graph when sync succeeds.
 * @param request - Work package fields to persist.
 * @param request.roadmap_root - Editable roadmap root path.
 * @param request.node_id - Fully qualified work-package id.
 * @param request.description - Package description text.
 * @param request.dependencies - Predecessor titles in document order.
 * @param request.estimate - Leaf estimate; omitted for parent packages.
 * @param request.classifications - Assignments to write onto the package.
 * @returns Save result with optional graph and validation issues.
 */
export async function saveWorkPackage(request: {
  roadmap_root: string;
  node_id: string;
  description: string;
  dependencies: string[];
  estimate?: WorkPackageEstimate;
  classifications?: AttributeAssignment[];
}): Promise<SaveWorkPackageResult> {
  const { estimate, classifications, ...rest } = request;
  const dto = await invoke<SaveWorkPackageResponseDto>("update_work_package_command", {
    request: {
      ...rest,
      ...(estimate !== undefined ? { estimate: toEstimateWire(estimate) } : {}),
      classifications: (classifications ?? []).map((assignment) => ({
        name: assignment.name,
        value: assignment.value,
        payload: assignment.payload,
        pinned_version: assignment.pinnedVersion,
      })),
    },
  });
  return {
    detail: nodeDetailFromDto(dto.detail),
    graph: dto.graph ? fromRoadmapGraphDto(dto.graph) : null,
    dependencyWarnings: dto.dependency_warnings.map((warning) => ({
      line: warning.line,
      message: warning.message,
    })),
    otherIssues: (dto.other_issues ?? []).map((warning) => ({
      line: warning.line,
      message: warning.message,
    })),
    syncSkipped: dto.sync_skipped,
  };
}
