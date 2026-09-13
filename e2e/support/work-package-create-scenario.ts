import type { Scenario } from "./fixtures";

export const PROJECT = { id: "project/billing-redesign", type: "project" };
export const WP_PARENT = {
  id: "project/billing-redesign/wp-invoicing",
  type: "work_package",
};
export const WP_LEAF = {
  id: "project/billing-redesign/wp-pdf-export",
  type: "work_package",
};
const PARENT_LINK = {
  id: "parent_of--invoicing--pdf",
  link_type: "parent_of",
  source: WP_PARENT.id,
  target: WP_LEAF.id,
};

/** Preset layout that keeps the invoicing container sized so compound mode stays on. */
export const COMPOUND_CREATE_LAYOUT: NonNullable<Scenario["layout"]> = {
  version: 1,
  kind: "bellman-gui-work-package-layout",
  top_level: {},
  projects: {
    "billing-redesign": {
      [WP_PARENT.id]: { x: 0, y: 0, w: 420, h: 280 },
      [WP_LEAF.id]: { x: -90, y: -30 },
    },
  },
};

/**
 * Compound-ready project graph used by create and root-drag specs.
 * @param overrides Optional scenario fields.
 * @param overrides.layout Preset compound positions that keep compound mode on.
 * @returns Graph scenario for work-package create and drag tests.
 */
export function createScenario(overrides?: {
  layout?: Scenario["layout"];
}): Scenario {
  return {
    states: [
      {
        root: "/roadmap",
        editable: true,
        nodes: [PROJECT, WP_PARENT, WP_LEAF],
        links: [PARENT_LINK],
        link_types: [
          {
            link_type: "parent_of",
            in_type: "work_package",
            out_type: "work_package",
          },
        ],
        label: null,
      },
    ],
    index: 0,
    ...(overrides?.layout ? { layout: overrides.layout } : {}),
    nodeDetails: {
      [WP_PARENT.id]: {
        node_id: WP_PARENT.id,
        node_type: "work_package",
        title: "wp-invoicing",
        markdown: "# wp-invoicing\n\nParent package.",
        source_path: "/roadmap/projects/billing-redesign/work-packages.yaml",
        work_package: {
          role: "parent",
          project: "billing-redesign",
          title: "wp-invoicing",
          description: "Parent package.",
          dependencies: [],
          available_titles: ["wp-invoicing", "wp-pdf-export"],
        },
      },
      [WP_LEAF.id]: {
        node_id: WP_LEAF.id,
        node_type: "work_package",
        title: "wp-pdf-export",
        markdown: "# wp-pdf-export\n\nLeaf package.",
        source_path: "/roadmap/projects/billing-redesign/work-packages.yaml",
        work_package: {
          role: "leaf",
          project: "billing-redesign",
          title: "wp-pdf-export",
          description: "Leaf package.",
          dependencies: [],
          available_titles: ["wp-invoicing", "wp-pdf-export"],
          estimate: "unknown",
        },
      },
    },
  };
}
