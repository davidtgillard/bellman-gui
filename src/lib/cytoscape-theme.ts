import type { StylesheetStyle } from "cytoscape";
import {
  DEFAULT_COMPOUND_GRAPH_THEME,
  mergeCompoundGraphStylesheet,
} from "@dgillard/cytoscape-compound-graph";

/** @deprecated Used by legacy cytoscape-layout helpers pending removal. */
export const COMPOUND_PADDING = DEFAULT_COMPOUND_GRAPH_THEME.compoundPadding;

/** @deprecated Used by legacy cytoscape-layout helpers pending removal. */
export const COMPOUND_MIN_WIDTH = DEFAULT_COMPOUND_GRAPH_THEME.compoundMinSize.width;

/** @deprecated Used by legacy cytoscape-layout helpers pending removal. */
export const COMPOUND_MIN_HEIGHT = DEFAULT_COMPOUND_GRAPH_THEME.compoundMinSize.height;

/** Bellman theme overrides for work-package compound graphs. */
export const BELLMAN_COMPOUND_GRAPH_THEME = {
  ...DEFAULT_COMPOUND_GRAPH_THEME,
  childEdgeClearancePx: -5,
};

/** Typography shared by top-level graph node labels and the inline rename editor. */
export const GRAPH_NODE_LABEL_TYPOGRAPHY = {
  fontSizePx: 11,
  color: "#e2e8f0",
  outlineColor: "#0f172a",
  /** Matches Cytoscape `text-outline-width`; label bounds include this inset. */
  outlineWidthPx: 2,
  textMaxWidthPx: 120,
} as const;

export const CYTOSCAPE_BASE_STYLESHEET: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-family": "Helvetica",
      "font-size": GRAPH_NODE_LABEL_TYPOGRAPHY.fontSizePx,
      color: GRAPH_NODE_LABEL_TYPOGRAPHY.color,
      "text-outline-color": GRAPH_NODE_LABEL_TYPOGRAPHY.outlineColor,
      "text-outline-width": GRAPH_NODE_LABEL_TYPOGRAPHY.outlineWidthPx,
    },
  },
  {
    selector: "node:childless:not([kind = 'leaf'])",
    style: {
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 6,
      "text-wrap": "wrap",
      "text-max-width": `${GRAPH_NODE_LABEL_TYPOGRAPHY.textMaxWidthPx}px`,
      "background-color": "data(color)",
      width: 36,
      height: 36,
      shape: "ellipse",
      "z-index": 10,
    },
  },
  {
    selector: "node:selected:childless:not([kind = 'leaf'])",
    style: {
      "border-width": 3,
      "border-color": "#38bdf8",
      "border-opacity": 1,
    },
  },
  {
    selector: "node.title-editing",
    style: {
      "text-opacity": 0,
    },
  },
  {
    selector: "node:active:childless:not([kind = 'leaf'])",
    style: {
      "overlay-opacity": 0.15,
      "overlay-color": "#38bdf8",
    },
  },
  {
    selector: "edge",
    style: {
      width: 2,
      "line-color": "#64748b",
      "target-arrow-color": "#64748b",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 9,
      color: "#94a3b8",
      "text-outline-color": "#0f172a",
      "text-outline-width": 2,
      "text-rotation": "autorotate",
      "text-margin-y": -8,
    },
  },
  {
    selector: "edge:selected",
    style: {
      "line-color": "#38bdf8",
      "target-arrow-color": "#38bdf8",
      width: 3,
    },
  },
];

/**
 * Work-package graph stylesheet: base rules plus flat container/leaf compound rules.
 * @returns Cytoscape stylesheet for work-package compound graphs.
 */
export function workPackageGraphStylesheet(): StylesheetStyle[] {
  return [
    ...mergeCompoundGraphStylesheet(CYTOSCAPE_BASE_STYLESHEET, BELLMAN_COMPOUND_GRAPH_THEME),
    {
      selector: "node[kind = 'leaf']",
      style: {
        "overlay-opacity": 0,
        "overlay-padding": 0,
        "border-width": 0,
        "border-opacity": 0,
      },
    },
    {
      selector: "node[kind = 'leaf']:active",
      style: {
        "overlay-opacity": 0,
        "overlay-padding": 0,
      },
    },
    {
      selector: "node[kind = 'leaf'].overflow, node[kind = 'leaf'][isOverflow]",
      style: {
        shape: "round-rectangle",
        "background-opacity": 0.08,
        "background-color": "#94a3b8",
        "border-width": 1,
        "border-style": "dashed",
        "border-color": "#94a3b8",
        width: 48,
        height: 28,
        "font-size": 10,
        "text-valign": "center",
        "text-margin-y": 0,
        "text-wrap": "wrap",
        "text-max-width": "100px",
      },
    },
  ];
}

/** Standard roadmap graph stylesheet (non-compound). */
export const CYTOSCAPE_STYLESHEET: StylesheetStyle[] = CYTOSCAPE_BASE_STYLESHEET;
