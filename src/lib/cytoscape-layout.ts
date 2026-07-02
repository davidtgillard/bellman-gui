import type { Core, EventObject, LayoutOptions, NodeSingular } from "cytoscape";
import type { NodePosition, NodeSize } from "./graph-layout";
import { MIN_NODE_DISTANCE } from "./graph-layout";
import { COMPOUND_MIN_HEIGHT, COMPOUND_MIN_WIDTH, COMPOUND_PADDING } from "./cytoscape-theme";

export const LAYOUT_FIT_PADDING = 40;

/** Forces an immediate canvas repaint; use after programmatic position/size changes. */
export function redrawGraphSynchronously(cy: Core): void {
  const renderer = (
    cy as unknown as {
      renderer?: () => { render?: (options?: unknown) => void } | undefined;
    }
  ).renderer?.();
  renderer?.render?.();
}

/** Rendered box for HTML composite chrome, after flushing any pending canvas paint. */
export function compoundChromeRenderedBox(node: NodeSingular): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  redrawGraphSynchronously(node.cy());
  return node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
}

export const PRESET_LAYOUT = {
  name: "preset",
  fit: true,
  padding: LAYOUT_FIT_PADDING,
} as const;

export const COSE_LAYOUT = {
  name: "cose",
  animate: false,
  fit: true,
  padding: LAYOUT_FIT_PADDING,
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
  padding: LAYOUT_FIT_PADDING,
  quality: "default",
  randomize: true,
  packComponents: false,
  tile: false,
  nodeSeparation: 120,
  nodeRepulsion: 5500,
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
  nodeSeparation: 150,
  idealEdgeLength: 120,
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
  const minDistance = MIN_NODE_DISTANCE;
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
}

interface VisualBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const NODE_OVERLAP_PADDING = 8;
const MAX_OVERLAP_RESOLUTION_ITERATIONS = 60;
const OVERLAP_RESOLUTION_PASSES = 3;

function nodeVisualBox(node: NodeSingular, padding = NODE_OVERLAP_PADDING): VisualBox {
  const box = node.boundingBox({ includeLabels: true });
  return {
    x1: box.x1 - padding,
    y1: box.y1 - padding,
    x2: box.x2 + padding,
    y2: box.y2 + padding,
  };
}

function visualBoxesOverlap(left: VisualBox, right: VisualBox): boolean {
  return (
    left.x1 < right.x2 &&
    left.x2 > right.x1 &&
    left.y1 < right.y2 &&
    left.y2 > right.y1
  );
}

function visualBoxContains(outer: VisualBox, inner: VisualBox): boolean {
  return (
    inner.x1 >= outer.x1 &&
    inner.y1 >= outer.y1 &&
    inner.x2 <= outer.x2 &&
    inner.y2 <= outer.y2
  );
}

function boundingBoxToVisual(box: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}): VisualBox {
  return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
}

/**
 * Returns the interior rectangle of a composite node in model coordinates, i.e.
 * the region inside its padding where child nodes (and their labels) must stay.
 * @param parent - Compound parent node.
 * @returns Interior box that children must remain within.
 */
export function compoundInteriorBox(parent: NodeSingular): VisualBox {
  const box = parent.boundingBox({ includeLabels: false, includeOverlays: false });
  return {
    x1: box.x1 + COMPOUND_PADDING.left,
    y1: box.y1 + COMPOUND_PADDING.top,
    x2: box.x2 - COMPOUND_PADDING.right,
    y2: box.y2 - COMPOUND_PADDING.bottom,
  };
}

/**
 * Computes the translation that pulls a footprint fully inside a container box.
 * When the footprint is larger than the container along an axis, it is centered
 * on that axis instead. Pure helper so drag clamping can be unit-tested.
 * @param footprint - The moving element's bounding box.
 * @param container - The box the footprint must stay within.
 * @returns Delta to add to the element's position to satisfy the constraint.
 */
export function shiftBoxInside(
  footprint: VisualBox,
  container: VisualBox,
): { dx: number; dy: number } {
  const resolveAxis = (
    lo: number,
    hi: number,
    boundLo: number,
    boundHi: number,
  ): number => {
    const size = hi - lo;
    const bound = boundHi - boundLo;
    if (size >= bound) {
      return (boundLo + boundHi) / 2 - (lo + hi) / 2;
    }
    if (lo < boundLo) {
      return boundLo - lo;
    }
    if (hi > boundHi) {
      return boundHi - hi;
    }
    return 0;
  };

  return {
    dx: resolveAxis(footprint.x1, footprint.x2, container.x1, container.x2),
    dy: resolveAxis(footprint.y1, footprint.y2, container.y1, container.y2),
  };
}

/**
 * Returns the smallest composite size (padding included) that still contains the
 * given child footprint, floored by the global composite minimums. Used to freeze
 * a composite's initial size and to clamp how small a resize may go.
 * @param contentBox - Bounding box of the composite's children, or null when empty.
 * @returns Composite dimensions that fit the content without clipping.
 */
export function compoundSizeForContent(contentBox: VisualBox | null): NodeSize {
  if (!contentBox) {
    return { w: COMPOUND_MIN_WIDTH, h: COMPOUND_MIN_HEIGHT };
  }
  const contentWidth = contentBox.x2 - contentBox.x1;
  const contentHeight = contentBox.y2 - contentBox.y1;
  return {
    w: Math.max(
      COMPOUND_MIN_WIDTH,
      contentWidth + COMPOUND_PADDING.left + COMPOUND_PADDING.right,
    ),
    h: Math.max(
      COMPOUND_MIN_HEIGHT,
      contentHeight + COMPOUND_PADDING.top + COMPOUND_PADDING.bottom,
    ),
  };
}

/**
 * Pins a composite to explicit dimensions while keeping its top-left corner fixed.
 * Without this compensation, applying min-width/min-height shifts the node centre
 * (and every child) down and to the right.
 * @param node - Compound parent node to resize.
 * @param w - Pinned width in model units.
 * @param h - Pinned height in model units.
 */
export function applyFrozenCompoundSize(node: NodeSingular, w: number, h: number): void {
  const before = node.boundingBox({ includeLabels: false, includeOverlays: false });
  const topLeftX = before.x1;
  const topLeftY = before.y1;

  node.data("compoundWidth", w);
  node.data("compoundHeight", h);

  const after = node.boundingBox({ includeLabels: false, includeOverlays: false });
  const dx = topLeftX - after.x1;
  const dy = topLeftY - after.y1;
  if (dx === 0 && dy === 0) {
    return;
  }

  const position = node.position();
  node.position({ x: position.x + dx, y: position.y + dy });
}

function separationForOverlap(left: VisualBox, right: VisualBox): { dx: number; dy: number } {
  const overlapX = Math.min(left.x2, right.x2) - Math.max(left.x1, right.x1);
  const overlapY = Math.min(left.y2, right.y2) - Math.max(left.y1, right.y1);
  if (overlapX <= 0 || overlapY <= 0) {
    return { dx: 0, dy: 0 };
  }

  if (overlapX < overlapY) {
    const direction =
      (left.x1 + left.x2) / 2 < (right.x1 + right.x2) / 2 ? -1 : 1;
    const delta = direction * (overlapX / 2 + 1);
    return { dx: delta, dy: 0 };
  }

  const direction =
    (left.y1 + left.y2) / 2 < (right.y1 + right.y2) / 2 ? -1 : 1;
  const delta = direction * (overlapY / 2 + 1);
  return { dx: 0, dy: delta };
}

function layoutSiblingKey(node: NodeSingular): string {
  const parent = node.parent();
  return parent.nonempty() ? parent.first().id() : "";
}

function shouldSeparateNodes(left: NodeSingular, right: NodeSingular): boolean {
  if (left.id() === right.id()) {
    return false;
  }
  if (left.contains(right) || right.contains(left)) {
    return false;
  }
  return layoutSiblingKey(left) === layoutSiblingKey(right);
}

function moveNodeBy(node: NodeSingular, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) {
    return;
  }
  const position = node.position();
  node.position({
    x: position.x + dx,
    y: position.y + dy,
  });
}

function separateOverlappingPair(left: NodeSingular, right: NodeSingular): boolean {
  const leftBox = nodeVisualBox(left);
  const rightBox = nodeVisualBox(right);
  if (!visualBoxesOverlap(leftBox, rightBox)) {
    return false;
  }

  const leftIsParent = left.isParent();
  const rightIsParent = right.isParent();

  if (leftIsParent && !rightIsParent) {
    const { dx, dy } = separationToClearOverlap(rightBox, leftBox);
    moveNodeBy(right, dx, dy);
    return true;
  }

  if (rightIsParent && !leftIsParent) {
    const { dx, dy } = separationToClearOverlap(leftBox, rightBox);
    moveNodeBy(left, dx, dy);
    return true;
  }

  const { dx, dy } = separationForOverlap(leftBox, rightBox);
  moveNodeBy(left, -dx, -dy);
  moveNodeBy(right, dx, dy);
  return true;
}

function groupNodesBySiblingKey(cy: Core): Map<string, NodeSingular[]> {
  const groups = new Map<string, NodeSingular[]>();

  for (const node of cy.nodes()) {
    const key = layoutSiblingKey(node);
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  return groups;
}

function siblingGroupDepth(cy: Core, siblingKey: string): number {
  if (siblingKey === "") {
    return 0;
  }

  const parent = cy.getElementById(siblingKey);
  if (parent.empty()) {
    return 0;
  }

  return parent.ancestors().length + 1;
}

function resolveSiblingGroup(nodes: NodeSingular[]): void {
  if (nodes.length < 2) {
    return;
  }

  for (let iteration = 0; iteration < MAX_OVERLAP_RESOLUTION_ITERATIONS; iteration++) {
    let moved = false;

    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex++) {
      const left = nodes[leftIndex];

      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex++) {
        const right = nodes[rightIndex];
        if (separateOverlappingPair(left, right)) {
          moved = true;
        }
      }
    }

    if (!moved) {
      break;
    }
  }
}

/**
 * Returns whether a child node's footprint currently escapes its compound
 * parent's interior. Handles both leaf children and inner composite children.
 * @param node - Child node to test at its current position.
 * @returns Whether the node visually escapes its parent's interior.
 */
export function nodeEscapesCompoundParent(node: NodeSingular): boolean {
  const parent = node.parent();
  if (parent.empty()) {
    return false;
  }

  const footprint = boundingBoxToVisual(
    node.boundingBox({ includeLabels: true, includeOverlays: false }),
  );
  return !visualBoxContains(compoundInteriorBox(parent.first()), footprint);
}

const DRAG_ANCESTOR_LOCK_KEY = "_dragAncestorLock";
const DRAG_START_POSITION_KEY = "_dragStartPosition";
const DRAG_GRAB_OFFSET_KEY = "_dragGrabOffset";
const COMPOUND_DRAG_KEY = "_compoundDrag";
const PROMOTED_PARENT_DRAG_KEY = "_promotedParentDrag";
const CHILD_DRAG_KEY = "_childDrag";

function clientPointToModelPosition(
  cy: Core,
  clientX: number,
  clientY: number,
): NodePosition {
  const container = cy.container();
  if (!container) {
    return { x: 0, y: 0 };
  }

  const rect = container.getBoundingClientRect();
  const pan = cy.pan();
  const zoom = cy.zoom();
  return {
    x: (clientX - rect.left - pan.x) / zoom,
    y: (clientY - rect.top - pan.y) / zoom,
  };
}

interface AncestorLockEntry {
  position: NodePosition;
  size: NodeSize;
  topLeft: { x: number; y: number };
}

interface DragAncestorLock {
  ancestors: Map<string, AncestorLockEntry>;
}

interface ChildDragState {
  siblingPositions: Map<string, NodePosition>;
}

interface CompoundDragState {
  startPositions: Map<string, NodePosition>;
}

/**
 * Captures absolute positions for a composite node and every descendant.
 * @param root - Composite parent node at drag start.
 * @returns Node positions keyed by id.
 */
export function snapshotSubtreePositions(root: NodeSingular): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const record = (target: NodeSingular) => {
    const position = target.position();
    positions.set(target.id(), { x: position.x, y: position.y });
  };
  record(root);
  root.descendants().forEach(record);
  return positions;
}

/**
 * Applies saved layout coordinates to graph nodes. Parent compounds are updated
 * before their children so compound relative positions stay coherent.
 */
export function applySavedNodePositions(
  cy: Core,
  nodePositions: Record<string, NodePosition> | undefined,
): void {
  if (!nodePositions) {
    return;
  }

  const entries = Object.entries(nodePositions).filter(
    ([nodeId]) => !cy.getElementById(nodeId).empty(),
  );
  if (entries.length === 0) {
    return;
  }

  const depthOf = (nodeId: string): number => {
    let depth = 0;
    let current = cy.getElementById(nodeId).parent();
    while (current.nonempty()) {
      depth += 1;
      current = current.first().parent();
    }
    return depth;
  };

  entries.sort(([leftId], [rightId]) => depthOf(leftId) - depthOf(rightId));
  const parentEntries = entries.filter(([nodeId]) =>
    cy.getElementById(nodeId).isParent(),
  );
  const leafEntries = entries.filter(
    ([nodeId]) => !cy.getElementById(nodeId).isParent(),
  );

  cy.batch(() => {
    for (const [nodeId, position] of parentEntries) {
      const node = cy.getElementById(nodeId);
      if (position.w !== undefined && position.h !== undefined) {
        const width = Number(node.data("compoundWidth"));
        const height = Number(node.data("compoundHeight"));
        if (width !== position.w || height !== position.h) {
          applyFrozenCompoundSize(node, position.w, position.h);
        }
      }
    }
  });

  cy.batch(() => {
    for (const [nodeId, position] of parentEntries) {
      const node = cy.getElementById(nodeId);
      const current = node.position();
      if (current.x !== position.x || current.y !== position.y) {
        node.position({ x: position.x, y: position.y });
      }
    }
  });

  cy.batch(() => {
    for (const [nodeId, position] of leafEntries) {
      const node = cy.getElementById(nodeId);
      const current = node.position();
      if (current.x !== position.x || current.y !== position.y) {
        node.position({ x: position.x, y: position.y });
      }
    }
  });

  redrawGraphSynchronously(cy);
}

/**
 * Moves a composite by updating its parent centre, then restoring each child's
 * drag-start parent-relative position in the same batch. Pinned compounds need
 * both writes together so the border and children stay aligned.
 */
function moveCompoundParentRigidly(
  cy: Core,
  node: NodeSingular,
  startPositions: Map<string, NodePosition>,
  targetPosition: NodePosition,
): void {
  cy.batch(() => {
    node.position(targetPosition);
    node.children().forEach((child) => {
      const start = startPositions.get(child.id());
      if (start) {
        child.position(start);
      }
    });
  });
}

/**
 * Moves a composite and its descendants rigidly to a target centre position.
 * Used instead of native compound dragging, which conflicts with pinned sizes.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param node - Composite parent being dragged.
 * @param startPositions - Subtree positions captured at drag start.
 * @param targetPosition - Desired centre for the composite parent.
 * @param ancestorLock - Optional ancestor size lock for nested composites.
 */
export function dragCompoundParentTo(
  cy: Core,
  node: NodeSingular,
  startPositions: Map<string, NodePosition>,
  targetPosition: NodePosition,
  ancestorLock?: DragAncestorLock,
): void {
  moveCompoundParentRigidly(cy, node, startPositions, targetPosition);

  if (node.isChild()) {
    cy.batch(() => {
      constrainChildWithinParent(node);
      restoreAncestorLock(cy, ancestorLock);
    });
  }

  redrawGraphSynchronously(cy);
}

/**
 * Applies which nodes may be dragged natively. Composite parents that contain
 * children are not grabbable — Cytoscape would otherwise translate the parent
 * when a child is dragged (especially with only one child). Those composites
 * move via the title bar when selected. Children are repositioned via manual
 * pointer drag (with a movement threshold) and are not natively grabbable.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param draggable - Whether the graph is in edit mode.
 */
export function applyCompoundGrabPolicy(cy: Core, draggable: boolean): void {
  if (!draggable) {
    cy.nodes().ungrabify();
    return;
  }

  cy.nodes().grabify();
  cy.nodes(":parent").forEach((parent) => {
    if (parent.children().length > 0) {
      parent.ungrabify();
    }
  });
  cy.nodes(":child").ungrabify();
}

/**
 * Returns whether a child grab should move its composite parent instead.
 * Disabled: composite moves via the title bar when selected, or by grabbing
 * empty interior padding. Child grabs always reposition the child.
 */
export function shouldPromoteChildGrabToParent(_node: NodeSingular): boolean {
  return false;
}

function resolveDragTarget(node: NodeSingular): NodeSingular {
  const promotedId = node.scratch(PROMOTED_PARENT_DRAG_KEY) as string | undefined;
  if (!promotedId) {
    return node;
  }
  const parent = node.cy().getElementById(promotedId);
  return parent.nonempty() ? (parent as NodeSingular) : node;
}

function beginCompoundDrag(
  node: NodeSingular,
  cursor: NodePosition | undefined,
): void {
  const position = node.position();
  node.scratch(DRAG_START_POSITION_KEY, { x: position.x, y: position.y });
  node.scratch(COMPOUND_DRAG_KEY, {
    startPositions: snapshotSubtreePositions(node),
  });
  node.scratch(
    DRAG_GRAB_OFFSET_KEY,
    cursor ? { x: position.x - cursor.x, y: position.y - cursor.y } : { x: 0, y: 0 },
  );
  if (node.isChild()) {
    node.scratch(DRAG_ANCESTOR_LOCK_KEY, snapshotCompoundAncestorLock(node));
  }
}

function clearDragState(node: NodeSingular): void {
  node.removeScratch(DRAG_ANCESTOR_LOCK_KEY);
  node.removeScratch(DRAG_START_POSITION_KEY);
  node.removeScratch(DRAG_GRAB_OFFSET_KEY);
  node.removeScratch(COMPOUND_DRAG_KEY);
  node.removeScratch(PROMOTED_PARENT_DRAG_KEY);
  node.removeScratch(CHILD_DRAG_KEY);
}

export function compoundAbsolutePosition(node: NodeSingular): NodePosition {
  const position = node.position();
  const parent = node.parent();
  if (parent.empty()) {
    return { x: position.x, y: position.y };
  }

  const parentAbsolute = compoundAbsolutePosition(parent.first());
  return {
    x: parentAbsolute.x + position.x,
    y: parentAbsolute.y + position.y,
  };
}

/**
 * Returns the topmost leaf child under a rendered point inside the graph canvas.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param x - Rendered x coordinate relative to the graph container.
 * @param y - Rendered y coordinate relative to the graph container.
 */
export function childLeafAtRenderedPoint(
  cy: Core,
  x: number,
  y: number,
): NodeSingular | null {
  let best: NodeSingular | null = null;
  let bestZ = -Infinity;

  cy.nodes(":childless").forEach((node) => {
    if (!node.isChild()) {
      return;
    }

    const box = node.renderedBoundingBox({ includeLabels: true, includeOverlays: false });
    if (x < box.x1 || x > box.x2 || y < box.y1 || y > box.y2) {
      return;
    }

    const z = Number(node.style("z-index")) || 0;
    if (z >= bestZ) {
      bestZ = z;
      best = node;
    }
  });

  return best;
}

function setCompoundAbsolutePosition(
  node: NodeSingular,
  absolute: NodePosition,
): void {
  const parent = node.parent();
  if (parent.empty()) {
    node.position(absolute);
    return;
  }

  const parentAbsolute = compoundAbsolutePosition(parent.first());
  node.position({
    x: absolute.x - parentAbsolute.x,
    y: absolute.y - parentAbsolute.y,
  });
}

/**
 * Captures absolute positions for every node in a composite except the dragged
 * node and its descendants.
 * @param dragged - Node the user is repositioning inside its parent composite.
 * @returns Sibling absolute positions keyed by node id.
 */
export function snapshotSiblingPositions(
  dragged: NodeSingular,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const parent = dragged.parent();
  if (parent.empty()) {
    return positions;
  }

  const excluded = new Set<string>([dragged.id()]);
  dragged.descendants().forEach((node) => {
    excluded.add(node.id());
  });

  const record = (target: NodeSingular) => {
    if (excluded.has(target.id())) {
      return;
    }
    positions.set(target.id(), compoundAbsolutePosition(target));
  };

  parent.first().children().forEach((child) => {
    record(child);
    child.descendants().forEach(record);
  });

  return positions;
}

/**
 * Captures ancestor composite pinned sizes before a child drag.
 * @param node - The node being dragged inside one or more composites.
 * @returns Locked ancestor sizes to restore after each drag update.
 */
export function snapshotCompoundAncestorLock(node: NodeSingular): DragAncestorLock {
  return snapshotAncestorLocks(node);
}

/**
 * Clamps a child drag and restores ancestor composite geometry so outer boxes stay
 * pinned while siblings keep their absolute positions.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param node - The dragged child or inner composite node.
 * @param lock - Ancestor snapshot from {@link snapshotCompoundAncestorLock}.
 */
export function constrainCompoundChildDrag(
  cy: Core,
  node: NodeSingular,
  lock: DragAncestorLock | undefined,
  childDrag?: ChildDragState,
  targetAbsolute?: NodePosition,
): void {
  if (!node.isChild()) {
    return;
  }

  const draggedAbsolute = targetAbsolute ?? compoundAbsolutePosition(node);

  cy.batch(() => {
    restoreAncestorLockDuringChildDrag(cy, lock);
    restoreSiblingPositions(cy, childDrag);
    setCompoundAbsolutePosition(node, draggedAbsolute);
    constrainChildWithinParent(node);
    restoreAncestorLockDuringChildDrag(cy, lock);
    restoreSiblingPositions(cy, childDrag);
  });
}

function snapshotAncestorLocks(node: NodeSingular): DragAncestorLock {
  const ancestors = new Map<string, AncestorLockEntry>();

  let current = node.parent();
  while (current.nonempty()) {
    const parent = current.first();
    const width = parent.data("compoundWidth");
    const height = parent.data("compoundHeight");
    if (width !== undefined && height !== undefined) {
      const position = parent.position();
      const box = parent.boundingBox({ includeLabels: false, includeOverlays: false });
      ancestors.set(parent.id(), {
        position: { x: position.x, y: position.y },
        size: { w: Number(width), h: Number(height) },
        topLeft: { x: box.x1, y: box.y1 },
      });
    }

    current = parent.parent();
  }

  return { ancestors };
}

function restoreSiblingPositions(
  cy: Core,
  childDrag: ChildDragState | undefined,
): void {
  if (!childDrag) {
    return;
  }

  cy.batch(() => {
    for (const [id, absolute] of childDrag.siblingPositions) {
      const target = cy.getElementById(id);
      if (!target.empty()) {
        setCompoundAbsolutePosition(target, absolute);
      }
    }
  });
}

function lockParentCenter(
  parent: NodeSingular,
  entry: AncestorLockEntry,
): void {
  parent.position(entry.position);
  applyFrozenCompoundSize(parent, entry.size.w, entry.size.h);
}

function finalizeChildDragComposite(
  cy: Core,
  grabbed: NodeSingular,
  lock: DragAncestorLock | undefined,
  childDrag: ChildDragState | undefined,
): void {
  if (!grabbed.isChild()) {
    restoreSiblingPositions(cy, childDrag);
    return;
  }

  cy.batch(() => {
    restoreSiblingPositions(cy, childDrag);
    restoreAncestorLockDuringChildDrag(cy, lock);
    constrainChildWithinParent(grabbed);
    restoreAncestorLockDuringChildDrag(cy, lock);
    restoreSiblingPositions(cy, childDrag);
  });
  redrawGraphSynchronously(cy);
}

function restoreAncestorLockDuringChildDrag(
  cy: Core,
  lock: DragAncestorLock | undefined,
): void {
  if (!lock) {
    return;
  }

  cy.batch(() => {
    for (const [nodeId, entry] of lock.ancestors) {
      const parent = cy.getElementById(nodeId);
      if (parent.empty()) {
        continue;
      }
      lockParentCenter(parent, entry);
    }
  });
}

function restoreAncestorLock(cy: Core, lock: DragAncestorLock | undefined): void {
  if (!lock) {
    return;
  }

  cy.batch(() => {
    for (const [nodeId, entry] of lock.ancestors) {
      const parent = cy.getElementById(nodeId);
      if (parent.empty()) {
        continue;
      }

      parent.position(entry.position);
      applyFrozenCompoundSize(parent, entry.size.w, entry.size.h);

      const finalBox = parent.boundingBox({ includeLabels: false, includeOverlays: false });
      moveNodeBy(parent, entry.topLeft.x - finalBox.x1, entry.topLeft.y - finalBox.y1);
    }
  });
}

// Keeps a child node's (label-inclusive) footprint inside its parent's fixed
// interior. Only the dragged node is moved: siblings are never displaced and the
// parent is never resized. Inner composite children are carried rigidly with
// their own descendants because moving a compound node moves its children.
function constrainChildWithinParent(node: NodeSingular): void {
  const parent = node.parent();
  if (parent.empty()) {
    return;
  }

  const interior = compoundInteriorBox(parent.first());
  const footprint = boundingBoxToVisual(
    node.boundingBox({ includeLabels: true, includeOverlays: false }),
  );
  const { dx, dy } = shiftBoxInside(footprint, interior);
  if (dx !== 0 || dy !== 0) {
    moveNodeBy(node, dx, dy);
  }
}

/**
 * Builds the set of node positions that must be persisted after a drag ends.
 * Dragging a composite also moves its descendants in Cytoscape, so their
 * positions must be saved together. Ancestor composite positions are included
 * when they may have drifted during a nested drag.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param draggedNodeId - Id of the node the user finished dragging.
 * @returns Node positions keyed by id for layout persistence.
 */
export function collectDragPersistencePositions(
  cy: Core,
  draggedNodeId: string,
): Record<string, NodePosition> {
  const node = cy.getElementById(draggedNodeId);
  if (node.empty()) {
    return {};
  }

  const updates: Record<string, NodePosition> = {};

  const recordNode = (target: NodeSingular) => {
    const position = target.position();
    const entry: NodePosition = { x: position.x, y: position.y };
    if (target.isParent()) {
      const width = target.data("compoundWidth");
      const height = target.data("compoundHeight");
      if (width !== undefined && height !== undefined) {
        entry.w = Number(width);
        entry.h = Number(height);
      }
    }
    updates[target.id()] = entry;
  };

  recordNode(node);

  if (node.isParent()) {
    node.descendants().forEach((descendant) => {
      recordNode(descendant);
    });
  }

  const includeAncestors = !(node.isChild() && !node.isParent());
  if (!includeAncestors) {
    return updates;
  }

  let ancestor = node.parent();
  while (ancestor.nonempty()) {
    recordNode(ancestor.first());
    ancestor = ancestor.first().parent();
  }

  return updates;
}

/**
 * Installs drag constraints that keep composite work packages coherent:
 * - Dragging a composite (parent) moves it and its children rigidly; its size,
 *   shape, and the relative placement of its children are untouched.
 * - Dragging a child (leaf or inner composite) moves only that node via manual
 *   pointer drag, clamped to stay inside the parent's fixed interior, without
 *   resizing the parent or displacing siblings.
 * Node size is never changed here; resizing happens solely through the explicit
 * resize handles.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param onDragComplete - Called with all node positions that changed during drag.
 * @returns Cleanup function that removes drag listeners.
 */
export function installDragOverlapConstraints(
  cy: Core,
  onDragComplete?: (positions: Record<string, NodePosition>) => void,
): () => void {
  const grabOffset = (node: NodeSingular): NodePosition =>
    (node.scratch(DRAG_GRAB_OFFSET_KEY) as NodePosition | undefined) ?? { x: 0, y: 0 };

  const handleDrag = (grabbed: NodeSingular, cursor?: NodePosition) => {
    const node = resolveDragTarget(grabbed);
    const compoundDrag = node.scratch(COMPOUND_DRAG_KEY) as CompoundDragState | undefined;
    if (!compoundDrag || !node.isParent()) {
      return;
    }

    const offset = grabOffset(node);
    const target = cursor
      ? { x: cursor.x + offset.x, y: cursor.y + offset.y }
      : node.position();
    dragCompoundParentTo(
      cy,
      node,
      compoundDrag.startPositions,
      target,
      node.scratch(DRAG_ANCESTOR_LOCK_KEY) as DragAncestorLock | undefined,
    );
  };

  interface PendingChildPress {
    node: NodeSingular;
    startClientX: number;
    startClientY: number;
    startPosition: NodePosition;
    grabOffset: NodePosition;
    lock: DragAncestorLock;
    childDrag: ChildDragState;
  }

  interface ActiveChildPointerDrag {
    node: NodeSingular;
    startPosition: NodePosition;
    grabOffset: NodePosition;
    lock: DragAncestorLock;
    childDrag: ChildDragState;
  }

  const CHILD_DRAG_THRESHOLD_PX = 4;
  let pendingChildPress: PendingChildPress | null = null;
  let activeChildPointerDrag: ActiveChildPointerDrag | null = null;

  const clearChildPointerListeners = () => {
    window.removeEventListener("mousemove", onChildPointerMove, true);
    window.removeEventListener("mouseup", onChildPointerUp, true);
  };

  const cancelChildPointerInteraction = () => {
    pendingChildPress = null;
    activeChildPointerDrag = null;
    clearChildPointerListeners();
  };

  const applyChildPointerDrag = (clientX: number, clientY: number): void => {
    if (!activeChildPointerDrag) {
      return;
    }

    const { node, grabOffset: offset, lock, childDrag } = activeChildPointerDrag;
    const cursor = clientPointToModelPosition(cy, clientX, clientY);
    constrainCompoundChildDrag(cy, node, lock, childDrag, {
      x: cursor.x + offset.x,
      y: cursor.y + offset.y,
    });
  };

  const finishChildPointerDrag = (): void => {
    if (!activeChildPointerDrag) {
      return;
    }

    const { node, startPosition, lock, childDrag } = activeChildPointerDrag;
    const endPosition = { ...node.position() };
    const moved =
      startPosition.x !== endPosition.x || startPosition.y !== endPosition.y;

    pendingChildPress = null;
    activeChildPointerDrag = null;
    clearChildPointerListeners();

    if (!moved) {
      return;
    }

    const finalize = () => {
      finalizeChildDragComposite(cy, node, lock, childDrag);
    };

    finalize();
    window.requestAnimationFrame(() => {
      finalize();
      window.requestAnimationFrame(finalize);
    });
    onDragComplete?.(collectDragPersistencePositions(cy, node.id()));
  };

  const onChildPointerMove = (event: MouseEvent): void => {
    if (!pendingChildPress && !activeChildPointerDrag) {
      return;
    }

    if (pendingChildPress && !activeChildPointerDrag) {
      const dx = event.clientX - pendingChildPress.startClientX;
      const dy = event.clientY - pendingChildPress.startClientY;
      if (Math.hypot(dx, dy) < CHILD_DRAG_THRESHOLD_PX) {
        return;
      }

      const pending = pendingChildPress;
      pendingChildPress = null;
      activeChildPointerDrag = {
        node: pending.node,
        startPosition: pending.startPosition,
        grabOffset: pending.grabOffset,
        lock: pending.lock,
        childDrag: pending.childDrag,
      };
    }

    if (!activeChildPointerDrag) {
      return;
    }

    event.preventDefault();
    applyChildPointerDrag(event.clientX, event.clientY);
  };

  const onChildPointerUp = (event: MouseEvent): void => {
    if (!pendingChildPress && !activeChildPointerDrag) {
      return;
    }

    if (activeChildPointerDrag) {
      event.preventDefault();
      applyChildPointerDrag(event.clientX, event.clientY);
      finishChildPointerDrag();
      return;
    }

    pendingChildPress = null;
    clearChildPointerListeners();
  };

  const onGrab = (event: EventObject) => {
    const node = event.target;
    if (node.isChild()) {
      return;
    }

    const cursor = event.position;

    if (shouldPromoteChildGrabToParent(node)) {
      const parent = node.parent().first();
      const parentPosition = parent.position();
      node.scratch(PROMOTED_PARENT_DRAG_KEY, parent.id());
      node.scratch(DRAG_START_POSITION_KEY, {
        x: parentPosition.x,
        y: parentPosition.y,
      });
      beginCompoundDrag(parent, cursor);
      handleDrag(node, cursor);
      return;
    }

    node.scratch(DRAG_START_POSITION_KEY, {
      x: node.position().x,
      y: node.position().y,
    });

    if (node.isParent()) {
      beginCompoundDrag(node, cursor);
      handleDrag(node, cursor);
    }
  };

  const onDrag = (event: EventObject) => {
    const grabbed = event.target;
    if (grabbed.isChild()) {
      return;
    }

    const cursor = event.position
      ? { x: event.position.x, y: event.position.y }
      : undefined;
    handleDrag(grabbed, cursor);
  };

  const onDragFree = (event: EventObject) => {
    const grabbed = event.target;
    if (grabbed.isChild()) {
      return;
    }

    const node = resolveDragTarget(grabbed);

    handleDrag(grabbed);
    const start = grabbed.scratch(DRAG_START_POSITION_KEY) as NodePosition | undefined;
    clearDragState(grabbed);
    if (node.id() !== grabbed.id()) {
      clearDragState(node);
    }

    const position = node.position();
    const moved = !start || start.x !== position.x || start.y !== position.y;
    if (moved) {
      onDragComplete?.(collectDragPersistencePositions(cy, node.id()));
    }
  };

  const onChildMouseDown = (event: EventObject) => {
    const node = event.target;
    if (!node.isChild()) {
      return;
    }

    cancelChildPointerInteraction();

    if (!node.selected()) {
      cy.nodes().unselect();
      node.select();
    }

    const ancestorLock = snapshotCompoundAncestorLock(node);
    const position = node.position();
    const cursor = event.position ?? compoundAbsolutePosition(node);
    const childAbsolute = compoundAbsolutePosition(node);
    const originalEvent = event.originalEvent as MouseEvent | undefined;

    pendingChildPress = {
      node,
      startClientX: originalEvent?.clientX ?? 0,
      startClientY: originalEvent?.clientY ?? 0,
      startPosition: { x: position.x, y: position.y },
      grabOffset: {
        x: childAbsolute.x - cursor.x,
        y: childAbsolute.y - cursor.y,
      },
      lock: ancestorLock,
      childDrag: {
        siblingPositions: snapshotSiblingPositions(node),
      },
    };

    window.addEventListener("mousemove", onChildPointerMove, true);
    window.addEventListener("mouseup", onChildPointerUp, true);

    const testWindow = node.cy().container()?.ownerDocument?.defaultView as
      | (Window & {
          __TEST__?: {
            lastChildDragParentState?: {
              x: number;
              y: number;
              w?: number;
              h?: number;
              x1?: number;
              y1?: number;
            };
          };
        })
      | undefined;
    if (testWindow?.__TEST__) {
      const parent = node.parent().first();
      const position = parent.position();
      const box = parent.boundingBox({ includeLabels: false, includeOverlays: false });
      const state: {
        x: number;
        y: number;
        w?: number;
        h?: number;
        x1?: number;
        y1?: number;
      } = { x: position.x, y: position.y, x1: box.x1, y1: box.y1 };
      const width = parent.data("compoundWidth");
      const height = parent.data("compoundHeight");
      if (width !== undefined && height !== undefined) {
        state.w = Number(width);
        state.h = Number(height);
      }
      testWindow.__TEST__.lastChildDragParentState = state;
    }
  };

  cy.on("mousedown", "node", onChildMouseDown);
  cy.on("grab", "node", onGrab);
  cy.on("drag", "node", onDrag);
  cy.on("dragfree", "node", onDragFree);

  return () => {
    cancelChildPointerInteraction();
    cy.removeListener("grab", "node", onGrab);
    cy.removeListener("drag", "node", onDrag);
    cy.removeListener("dragfree", "node", onDragFree);
    cy.removeListener("mousedown", "node", onChildMouseDown);
  };
}

/** Default wheel sensitivity; matches Cytoscape's `wheelSensitivity` init option. */
export const DEFAULT_WHEEL_SENSITIVITY = 0.2;

/**
 * Computes the next zoom level for a wheel event, mirroring Cytoscape's internal
 * scroll-to-zoom formula so behaviour stays consistent when panning is disabled.
 * @param currentZoom - Current graph zoom level.
 * @param deltaY - Wheel delta along the Y axis.
 * @param deltaMode - DOM delta mode (`0` = pixels, `1` = lines).
 * @param sensitivity - Wheel sensitivity multiplier.
 * @param minZoom - Minimum allowed zoom level.
 * @param maxZoom - Maximum allowed zoom level.
 * @returns Clamped zoom level after applying the wheel delta.
 */
export function wheelZoomLevel(
  currentZoom: number,
  deltaY: number,
  deltaMode: number,
  sensitivity: number,
  minZoom: number,
  maxZoom: number,
): number {
  let delta = deltaY;
  if (Math.abs(delta) > 5) {
    delta = Math.sign(delta) * 5;
  }

  let diff = delta / -250;
  if (deltaMode === 1) {
    diff *= 33;
  }
  diff *= sensitivity;

  const nextZoom = currentZoom * 10 ** diff;
  return Math.min(maxZoom, Math.max(minZoom, nextZoom));
}

/**
 * Installs mouse-wheel zoom on the graph container. Cytoscape only zooms on
 * wheel when `userPanningEnabled` is true, but background drag-pan is toggled
 * independently in settings — this keeps wheel zoom always available.
 * @param wheelContainer - Element that receives wheel events (may include overlays).
 * @param cy - Cytoscape instance to zoom.
 * @param cyContainer - Cytoscape canvas container used for zoom focal coordinates.
 * @param sensitivity - Wheel sensitivity multiplier.
 * @returns Cleanup function that removes the wheel listener.
 */
export function installWheelZoom(
  wheelContainer: HTMLElement,
  cy: Core,
  cyContainer: HTMLElement,
  sensitivity = DEFAULT_WHEEL_SENSITIVITY,
): () => void {
  const onWheel = (event: WheelEvent) => {
    if (!cy.zoomingEnabled() || cy.destroyed()) {
      return;
    }

    event.preventDefault();

    const rect = cyContainer.getBoundingClientRect();
    const renderedPosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    const nextZoom = wheelZoomLevel(
      cy.zoom(),
      event.deltaY,
      event.deltaMode,
      sensitivity,
      cy.minZoom(),
      cy.maxZoom(),
    );

    cy.zoom({ level: nextZoom, renderedPosition });
  };

  wheelContainer.addEventListener("wheel", onWheel, { passive: false });
  return () => wheelContainer.removeEventListener("wheel", onWheel);
}

function separationToClearOverlap(moving: VisualBox, fixed: VisualBox): { dx: number; dy: number } {
  const overlapX = Math.min(moving.x2, fixed.x2) - Math.max(moving.x1, fixed.x1);
  const overlapY = Math.min(moving.y2, fixed.y2) - Math.max(moving.y1, fixed.y1);
  if (overlapX <= 0 || overlapY <= 0) {
    return { dx: 0, dy: 0 };
  }

  if (overlapX < overlapY) {
    const direction =
      (moving.x1 + moving.x2) / 2 < (fixed.x1 + fixed.x2) / 2 ? -1 : 1;
    return { dx: direction * (overlapX + 1), dy: 0 };
  }

  const direction =
    (moving.y1 + moving.y2) / 2 < (fixed.y1 + fixed.y2) / 2 ? -1 : 1;
  return { dx: 0, dy: direction * (overlapY + 1) };
}

/**
 * Nudges one node away from overlapping siblings without moving the others.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param movedNode - Node whose position should be adjusted.
 */
export function resolveNodeOverlapsForNode(cy: Core, movedNode: NodeSingular): void {
  for (let iteration = 0; iteration < MAX_OVERLAP_RESOLUTION_ITERATIONS; iteration++) {
    let moved = false;

    for (const other of cy.nodes()) {
      if (other.id() === movedNode.id()) {
        continue;
      }
      if (!shouldSeparateNodes(movedNode, other)) {
        continue;
      }
      if (separateOverlappingPair(movedNode, other)) {
        moved = true;
        break;
      }
    }

    if (!moved) {
      break;
    }
  }
}

/**
 * Nudges sibling nodes apart until their label-inclusive bounding boxes no longer overlap.
 * @param cy - Cytoscape instance containing the graph nodes.
 */
export function resolveNodeOverlaps(cy: Core): void {
  const groups = groupNodesBySiblingKey(cy);
  const sortedGroups = [...groups.entries()].sort(
    ([leftKey], [rightKey]) => siblingGroupDepth(cy, rightKey) - siblingGroupDepth(cy, leftKey),
  );

  for (let pass = 0; pass < OVERLAP_RESOLUTION_PASSES; pass++) {
    for (const [, nodes] of sortedGroups) {
      resolveSiblingGroup(nodes);
    }
  }
}

/**
 * Fits the viewport to all visible graph elements.
 * @param cy - Cytoscape instance containing the graph elements.
 */
export function fitGraphViewport(cy: Core): void {
  if (cy.nodes().length === 0) {
    return;
  }
  cy.fit(undefined, LAYOUT_FIT_PADDING);
}

/**
 * Applies preset or force-directed layout to the current graph.
 * @param cy - Cytoscape instance containing the graph elements.
 * @param nodePositions - Saved node positions keyed by node id.
 * @param linkCount - Number of visible links in the graph.
 * @param hasCompoundNodes - Whether the graph includes compound parent nodes.
 * @param onAutoLayoutComplete - Called with computed positions after auto layout.
 * @param isActive - Function that returns whether the layout is still active.
 * @param onLayoutApplied - Called after layout and viewport fitting complete.
 */
export function applyAutoLayout(
  cy: Core,
  nodePositions: Record<string, NodePosition> | undefined,
  linkCount: number,
  hasCompoundNodes = false,
  onAutoLayoutComplete?: (positions: Record<string, NodePosition>) => void,
  isActive?: () => boolean,
  onLayoutApplied?: () => void,
): void {
  const snapshotPositions = (): Record<string, NodePosition> => {
    const positions: Record<string, NodePosition> = {};
    cy.nodes().forEach((node) => {
      const position = node.position();
      positions[node.id()] = { x: position.x, y: position.y };
    });
    return positions;
  };

  const completeAutoLayout = () => {
    if (isActive && !isActive()) {
      return;
    }
    onAutoLayoutComplete?.(snapshotPositions());
  };

  const finishLayout = () => {
    if (isActive && !isActive()) {
      return;
    }
    fitGraphViewport(cy);
    onLayoutApplied?.();
  };

  if (usesPresetLayout(nodePositions)) {
    // Saved positions are applied when elements are added or via syncNodePositions.
    // Re-running preset layout would reset nodes to stale add-time coordinates,
    // which breaks compound parent/child relative positions.
    applySavedNodePositions(cy, nodePositions);
    finishLayout();
    return;
  }

  if (hasCompoundNodes) {
    // Wait for saved layout hydration before auto-laying out compounds; fcose
    // assigns absolute coordinates that break parent-relative child positions.
    finishLayout();
    return;
  }

  const seed = graphLayoutSeed(
    cy.nodes().map((node) => node.id()),
    cy.edges().map((edge) => edge.id()),
  );

  if (linkCount === 0 && !hasCompoundNodes) {
    scatterEdgelessNodes(cy, seed);
    resolveNodeOverlaps(cy);
    completeAutoLayout();
    finishLayout();
    return;
  }

  seedRandomNodePositions(cy, seed);
  const layout = cy.layout(autoLayoutOptions(linkCount, hasCompoundNodes));
  layout.one("layoutstop", () => {
    resolveNodeOverlaps(cy);
    completeAutoLayout();
    finishLayout();
  });
  layout.run();
}

/**
 * Runs auto layout once the graph container has a measurable size.
 * @param cy - Cytoscape instance containing the graph elements.
 * @param container - DOM container hosting the graph canvas.
 * @param nodePositions - Saved node positions keyed by node id.
 * @param linkCount - Number of visible links in the graph.
 * @param hasCompoundNodes - Whether the graph includes compound parent nodes.
 * @param onAutoLayoutComplete - Called with computed positions after auto layout.
 * @param onLayoutApplied - Called after layout and viewport fitting complete.
 * @returns Cleanup function that cancels pending layout attempts.
 */
export function runLayoutWhenContainerReady(
  cy: Core,
  container: HTMLElement,
  nodePositions: Record<string, NodePosition> | undefined,
  linkCount: number,
  hasCompoundNodes = false,
  onAutoLayoutComplete?: (positions: Record<string, NodePosition>) => void,
  onLayoutApplied?: () => void,
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

    applyAutoLayout(
      cy,
      nodePositions,
      linkCount,
      hasCompoundNodes,
      onAutoLayoutComplete,
      () => !cancelled,
      onLayoutApplied,
    );
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
