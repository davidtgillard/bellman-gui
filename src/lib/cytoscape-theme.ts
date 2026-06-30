import type { StylesheetStyle } from "cytoscape";

export const CYTOSCAPE_STYLESHEET: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 6,
      "font-size": 11,
      color: "#e2e8f0",
      "text-outline-color": "#0f172a",
      "text-outline-width": 2,
      "background-color": "data(color)",
      width: 36,
      height: 36,
      shape: "ellipse",
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 3,
      "border-color": "#38bdf8",
      "border-opacity": 1,
    },
  },
  {
    selector: "node:active",
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
