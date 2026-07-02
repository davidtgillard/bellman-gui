import type { StylesheetStyle } from "cytoscape";

/**
 * Interior padding of a composite (compound) node, in model units.
 * The top band is larger so the composite's own title sits above its children.
 */
export const COMPOUND_PADDING = {
  top: 52,
  right: 36,
  bottom: 36,
  left: 36,
} as const;

/** Minimum width/height a composite node may be resized to. */
export const COMPOUND_MIN_WIDTH = 80;
export const COMPOUND_MIN_HEIGHT = 80;

export const CYTOSCAPE_STYLESHEET: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-size": 11,
      color: "#e2e8f0",
      "text-outline-color": "#0f172a",
      "text-outline-width": 2,
    },
  },
  {
    selector: "node:childless",
    style: {
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 6,
      "text-wrap": "wrap",
      "text-max-width": "120px",
      "background-color": "data(color)",
      width: 36,
      height: 36,
      shape: "ellipse",
      "z-index": 10,
    },
  },
  {
    selector: ":parent",
    style: {
      "text-valign": "top",
      "text-halign": "center",
      "text-margin-y": -8,
      "text-wrap": "wrap",
      "text-max-width": "140px",
      shape: "round-rectangle",
      // Transparent fill: a visible fill made the parent capture presses over its
      // children (especially near the top-left). Use the title bar and border to
      // drag the composite instead.
      "background-opacity": 0,
      "border-width": 2,
      "border-color": "#64748b",
      "border-opacity": 0.6,
      padding: `${COMPOUND_PADDING.top}px ${COMPOUND_PADDING.right}px ${COMPOUND_PADDING.bottom}px ${COMPOUND_PADDING.left}px`,
      "min-width": `${COMPOUND_MIN_WIDTH}px`,
      "min-height": `${COMPOUND_MIN_HEIGHT}px`,
      "z-index": 0,
    },
  },
  {
    // Composite nodes with an explicit, user-controlled size. The box is pinned
    // to these dimensions; children are constrained to stay inside so the box
    // never auto-grows or auto-shrinks when children are moved. Extra space is
    // anchored to the bottom-right so moving one child does not re-center the
    // whole group and shift siblings.
    // `min-height-bias-bottom` is valid in Cytoscape but missing from its
    // TypeScript definitions, so this style object is cast to satisfy the compiler.
    selector: ":parent[compoundWidth]",
    style: {
      "min-width": "data(compoundWidth)",
      "min-width-bias-left": "0%",
      "min-width-bias-right": "100%",
      "min-height": "data(compoundHeight)",
      "min-height-bias-top": "0%",
      "min-height-bias-bottom": "100%",
    } as StylesheetStyle["style"],
  },
  {
    selector: "node.overflow",
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
  {
    selector: "node:selected:childless",
    style: {
      "border-width": 3,
      "border-color": "#38bdf8",
      "border-opacity": 1,
    },
  },
  {
    selector: ":child",
    style: {
      events: "yes",
    },
  },
  {
    // While selected, ignore pointer events on the composite shell so inner
    // nodes (including those in the top-left) receive grabs and drags. Move the
    // selected composite via its HTML title bar instead.
    selector: ":parent:selected",
    style: {
      "text-opacity": 0,
      "border-width": 2,
      "border-color": "#38bdf8",
      "border-opacity": 1,
      events: "no",
    },
  },
  {
    selector: "node:active:childless",
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
