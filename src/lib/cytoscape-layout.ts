import type { Core, LayoutOptions } from "cytoscape";
import type { NodePosition } from "./graph-layout";

export const PRESET_LAYOUT = {
  name: "preset",
  fit: true,
  padding: 40,
} as const;

export const COSE_LAYOUT = {
  name: "cose",
  animate: false,
  fit: true,
  padding: 40,
  randomize: false,
  nodeRepulsion: 20000,
  idealEdgeLength: 120,
  gravity: 0.05,
  numIter: 2000,
} as const;

export const FCOSE_LAYOUT = {
  name: "fcose",
  animate: false,
  fit: true,
  padding: 40,
  quality: "default",
  randomize: true,
  packComponents: false,
  tile: false,
  nodeSeparation: 100,
  nodeRepulsion: 4500,
  idealEdgeLength: 100,
} as const;

/**
 * Returns whether a saved layout document contains any node positions.
 * @param nodePositions - Saved node positions keyed by node id.
 * @returns Whether any saved positions exist.
 */
export function hasSavedLayout(
  nodePositions: Record<string, NodePosition> | undefined,
): boolean {
  return Boolean(nodePositions && Object.keys(nodePositions).length > 0);
}

/**
 * Returns whether the graph should use preset positions instead of auto layout.
 * @param nodePositions - Saved node positions keyed by node id.
 * @returns Whether preset layout should be used.
 */
export function usesPresetLayout(
  nodePositions: Record<string, NodePosition> | undefined,
): boolean {
  return hasSavedLayout(nodePositions);
}

const COMPOUND_FCOSE_LAYOUT = {
  ...FCOSE_LAYOUT,
  tile: true,
  packComponents: false,
} as const;

/**
 * Selects a force layout appropriate for the current graph density.
 * @param linkCount - Number of visible links in the graph.
 * @param hasCompoundNodes - Whether the graph includes compound parent nodes.
 * @returns Cytoscape layout options for the graph.
 */
export function autoLayoutOptions(
  linkCount: number,
  hasCompoundNodes = false,
): LayoutOptions {
  if (hasCompoundNodes) {
    return COMPOUND_FCOSE_LAYOUT;
  }
  if (linkCount === 0) {
    return COSE_LAYOUT;
  }
  return FCOSE_LAYOUT;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derives a stable numeric seed from graph element ids.
 * @param nodeIds - Node ids in the current graph.
 * @param edgeIds - Edge ids in the current graph.
 * @returns Deterministic seed for layout randomization.
 */
export function graphLayoutSeed(nodeIds: string[], edgeIds: string[]): number {
  return hashString(`${nodeIds.slice().sort().join("\0")}|${edgeIds.slice().sort().join("\0")}`);
}

/**
 * Assigns pseudo-random starting positions so force layouts do not settle
 * into symmetric grids when a graph has few or no edges.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param seed - Deterministic seed for pseudo-random placement.
 */
export function seedRandomNodePositions(cy: Core, seed: number): void {
  const nodeCount = cy.nodes().length;
  if (nodeCount === 0) {
    return;
  }

  const extent = Math.max(500, Math.sqrt(nodeCount) * 180);
  const random = mulberry32(seed);

  cy.nodes().forEach((node, index) => {
    const nodeSeed = hashString(`${seed}:${node.id()}:${index}`);
    const nodeRandom = mulberry32(nodeSeed);
    node.position({
      x: (nodeRandom() - 0.5) * extent * 2,
      y: (random() - 0.5) * extent * 2,
    });
  });
}

/**
 * Scatters disconnected nodes with minimum separation and no force equilibrium.
 * Force layouts converge to symmetric rings for edgeless graphs, which looks grid-like.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param seed - Deterministic seed for pseudo-random placement.
 */
export function scatterEdgelessNodes(cy: Core, seed: number): void {
  const nodeCount = cy.nodes().length;
  if (nodeCount === 0) {
    return;
  }

  const extent = Math.max(220, Math.sqrt(nodeCount) * 90);
  const minDistance = 85;
  const random = mulberry32(seed);
  const placed: Array<{ x: number; y: number }> = [];

  cy.nodes().forEach((node, index) => {
    const nodeSeed = hashString(`${seed}:${node.id()}:${index}`);
    const nodeRandom = mulberry32(nodeSeed);
    let position = { x: 0, y: 0 };

    for (let attempt = 0; attempt < 80; attempt++) {
      const candidate = {
        x: (nodeRandom() - 0.5) * extent * 2,
        y: (random() - 0.5) * extent * 2,
      };

      const overlaps = placed.some((existing) => {
        const dx = existing.x - candidate.x;
        const dy = existing.y - candidate.y;
        return Math.hypot(dx, dy) < minDistance;
      });

      if (!overlaps) {
        position = candidate;
        break;
      }
    }

    placed.push(position);
    node.position(position);
  });

  cy.fit(undefined, 30);
}

/**
 * Applies preset or force-directed layout to the current graph.
 * @param cy - Cytoscape instance containing the graph elements.
 * @param draggable - Whether nodes can be dragged in the current view.
 * @param nodePositions - Saved node positions keyed by node id.
 * @param linkCount - Number of visible links in the graph.
 * @param hasCompoundNodes - Whether the graph includes compound parent nodes.
 */
export function applyAutoLayout(
  cy: Core,
  nodePositions: Record<string, NodePosition> | undefined,
  linkCount: number,
  hasCompoundNodes = false,
): void {
  if (usesPresetLayout(nodePositions)) {
    cy.layout(PRESET_LAYOUT).run();
    return;
  }

  const seed = graphLayoutSeed(
    cy.nodes().map((node) => node.id()),
    cy.edges().map((edge) => edge.id()),
  );

  if (linkCount === 0 && !hasCompoundNodes) {
    scatterEdgelessNodes(cy, seed);
    return;
  }

  seedRandomNodePositions(cy, seed);
  cy.layout(autoLayoutOptions(linkCount, hasCompoundNodes)).run();
}

/**
 * Runs auto layout once the graph container has a measurable size.
 * @param cy - Cytoscape instance containing the graph elements.
 * @param container - DOM container hosting the graph canvas.
 * @param draggable - Whether nodes can be dragged in the current view.
 * @param nodePositions - Saved node positions keyed by node id.
 * @param linkCount - Number of visible links in the graph.
 * @param hasCompoundNodes - Whether the graph includes compound parent nodes.
 * @returns Cleanup function that cancels pending layout attempts.
 */
export function runLayoutWhenContainerReady(
  cy: Core,
  container: HTMLElement,
  nodePositions: Record<string, NodePosition> | undefined,
  linkCount: number,
  hasCompoundNodes = false,
): () => void {
  let cancelled = false;
  let laidOut = false;
  let frameId = 0;
  let timeoutId = 0;
  let resizeObserver: ResizeObserver | undefined;

  const run = () => {
    if (cancelled || laidOut || cy.destroyed()) {
      return false;
    }

    cy.resize();

    if (container.clientWidth <= 0 || container.clientHeight <= 0) {
      return false;
    }

    applyAutoLayout(cy, nodePositions, linkCount, hasCompoundNodes);
    laidOut = true;
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    return true;
  };

  const scheduleAttempts = () => {
    if (run()) {
      return;
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      if (run()) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        if (run()) {
          return;
        }

        if (!resizeObserver) {
          resizeObserver = new ResizeObserver(() => {
            run();
          });
          resizeObserver.observe(container);
        }

        timeoutId = window.setTimeout(() => {
          timeoutId = 0;
          run();
        }, 100);
      });
    });
  };

  scheduleAttempts();

  return () => {
    cancelled = true;
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    resizeObserver?.disconnect();
  };
}
