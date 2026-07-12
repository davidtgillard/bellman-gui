import exampleRegistry from "../fixtures/example-roadmap/.fits/registry.json";
import rootLinksRaw from "../fixtures/example-roadmap/links/links.jsonc?raw";
import goalSubgraphRaw from "../fixtures/example-roadmap/nodes/kind/goal goal/.fits/subgraph.jsonc?raw";
import initiativeSubgraphRaw from "../fixtures/example-roadmap/nodes/kind/initiative initiative/.fits/subgraph.jsonc?raw";
import milestoneSubgraphRaw from "../fixtures/example-roadmap/nodes/kind/milestone milestone/.fits/subgraph.jsonc?raw";
import projectKindSubgraphRaw from "../fixtures/example-roadmap/nodes/kind/project project/.fits/subgraph.jsonc?raw";
import billingSubgraphRaw from "../fixtures/example-roadmap/nodes/kind/project project/billing-redesign/.fits/subgraph.jsonc?raw";
import {
  parseRoadmapGraph,
  type LinkRecord,
  type LinksDocument,
  type RegistryDocument,
  type RoadmapGraph,
} from "./graph";

interface SubgraphDocument {
  links?: LinkRecord[];
}

const EXAMPLE_SUBGRAPH_RAW = [
  goalSubgraphRaw,
  initiativeSubgraphRaw,
  milestoneSubgraphRaw,
  projectKindSubgraphRaw,
  billingSubgraphRaw,
] as const;

/**
 * Parses a JSON or JSONC document that contains no comments (fixture files).
 * @param raw - File contents imported via Vite `?raw`.
 * @param label - Path label for error messages.
 * @returns Parsed document.
 * @throws {Error} When the fixture contents are not valid JSON.
 */
function parseFixtureJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`invalid fixture JSON in ${label}: ${String(error)}`);
  }
}

/**
 * Aggregates root links.jsonc and nested subgraph link arrays, matching
 * Tauri `collect_link_files` for the bundled example fixture.
 * @returns Combined links document for `parseRoadmapGraph`.
 */
export function loadBundledExampleLinks(): LinksDocument {
  const root = parseFixtureJson<LinksDocument>(
    rootLinksRaw,
    "links/links.jsonc",
  );
  const links = [...(root.links ?? [])];

  for (const raw of EXAMPLE_SUBGRAPH_RAW) {
    const subgraph = parseFixtureJson<SubgraphDocument>(raw, "subgraph.jsonc");
    if (subgraph.links?.length) {
      links.push(...subgraph.links);
    }
  }

  return { links };
}

/**
 * Builds the read-only bundled example roadmap graph from on-disk fixtures.
 * @returns Graph with `root: "example"` and `editable: false`.
 */
export function loadBundledExampleGraph(): RoadmapGraph {
  return parseRoadmapGraph(
    "example",
    exampleRegistry as RegistryDocument,
    loadBundledExampleLinks(),
  );
}

/**
 * Returns the empty-graph message for the current view context.
 * @param options - Current roadmap/view state used to choose the copy.
 * @param options.inWorkPackageGraph - Whether the inner work-package view is active.
 * @param options.activeProjectLabel - Display label for the focused project, if any.
 * @param options.roadmapRoot - Open roadmap root path, or `example`.
 * @param options.nodeCount - Number of nodes in the current roadmap graph.
 * @returns User-facing empty-state message.
 */
export function graphEmptyMessageFor(options: {
  inWorkPackageGraph: boolean;
  activeProjectLabel: string | null;
  roadmapRoot: string;
  nodeCount: number;
}): string {
  if (options.inWorkPackageGraph) {
    return options.activeProjectLabel
      ? `Project ${options.activeProjectLabel} has no work packages to display.`
      : "This project has no work packages to display.";
  }
  if (options.nodeCount === 0) {
    if (options.roadmapRoot !== "example") {
      return (
        "This roadmap has no registered nodes. Run `bellman sync` in the roadmap " +
        "folder, or show the example roadmap."
      );
    }
    return "Open a bellman roadmap folder to view its graph.";
  }
  return "Select at least one node type to display.";
}
