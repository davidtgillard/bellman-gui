import type { Core, EventObject, LayoutOptions, NodeSingular } from "cytoscape";
import type { NodePosition } from "./graph-layout";
import { MIN_NODE_DISTANCE } from "./graph-layout";

export const LAYOUT_FIT_PADDING = 40;

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

function nodeRenderedVisualBox(node: NodeSingular, padding = NODE_OVERLAP_PADDING): VisualBox {
  const box = node.renderedBoundingBox({ includeLabels: true });
  return {
    x1: box.x1 - padding,
    y1: box.y1 - padding,
    x2: box.x2 + padding,
    y2: box.y2 + padding,
  };
}

function nodeCoreModelBox(node: NodeSingular): VisualBox {
  const box = node.boundingBox({ includeLabels: false });
  return {
    x1: box.x1,
    y1: box.y1,
    x2: box.x2,
    y2: box.y2,
  };
}

function siblingNodesForDrag(node: NodeSingular): NodeSingular[] {
  const parent = node.parent();
  if (parent.nonempty()) {
    return parent.children().toArray().filter((other) => other.id() !== node.id());
  }

  return node
    .cy()
    .nodes()
    .toArray()
    .filter((other) => other.id() !== node.id() && other.parent().empty());
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

function compoundParentInteriorBox(parent: NodeSingular, tolerance = 4): VisualBox {
  const box = parent.boundingBox({ includeLabels: false });
  return {
    x1: box.x1 - tolerance,
    y1: box.y1 - tolerance,
    x2: box.x2 + tolerance,
    y2: box.y2 + tolerance,
  };
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
 * Returns whether a dragged node overlaps a sibling in rendered coordinates.
 * @param node - Node to test at its current position.
 * @returns Whether the node visually conflicts with a sibling.
 */
export function nodeHasSiblingOverlapDuringDrag(node: NodeSingular): boolean {
  const movingBox = nodeRenderedVisualBox(node);

  for (const other of siblingNodesForDrag(node)) {
    if (visualBoxesOverlap(movingBox, nodeRenderedVisualBox(other))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns whether a leaf node has been dragged outside its compound parent.
 * @param node - Childless node to test at its current position.
 * @returns Whether the node visually escapes its parent boundary.
 */
export function nodeEscapesCompoundParent(node: NodeSingular): boolean {
  if (!node.isChild() || node.isParent()) {
    return false;
  }

  const parent = node.parent();
  if (parent.empty()) {
    return false;
  }

  const nodeBox = nodeCoreModelBox(node);
  const parentBox = compoundParentInteriorBox(parent.first());
  return !visualBoxContains(parentBox, nodeBox);
}

/**
 * Returns whether a dragged node violates overlap or parent-boundary constraints.
 * @param node - Node to test at its current position.
 * @returns Whether the drag position should be rejected.
 */
export function nodeViolatesDragConstraints(node: NodeSingular): boolean {
  return nodeHasSiblingOverlapDuringDrag(node) || nodeEscapesCompoundParent(node);
}

/**
 * Returns whether a node's label-inclusive box overlaps a draggable sibling.
 * @param node - Node to test at its current position.
 * @returns Whether the node visually conflicts with a sibling.
 */
export function nodeHasSiblingOverlap(node: NodeSingular): boolean {
  const movingBox = nodeVisualBox(node);

  for (const other of node.cy().nodes()) {
    if (other.id() === node.id()) {
      continue;
    }
    if (!shouldSeparateNodes(node, other)) {
      continue;
    }
    if (visualBoxesOverlap(movingBox, nodeVisualBox(other))) {
      return true;
    }
  }

  return false;
}

const DRAG_LAST_VALID_KEY = "_dragLastValid";
const DRAG_GRAB_OFFSET_KEY = "_dragGrabOffset";
const DRAG_POSITION_LOCK_KEY = "_dragPositionLock";
const DRAG_VIEWPORT_KEY = "_dragViewport";

// Fraction of the demanded penetration that is actually applied, so pushing a
// node into a neighbor requires progressively more drag distance ("resistance").
const DRAG_OVERLAP_RESISTANCE = 0.35;
// Hard cap on how far a node may penetrate a neighbor during drag, as a fraction
// of the smaller node's extent along the contact axis.
const DRAG_MAX_PENETRATION_RATIO = 0.25;

interface ViewportSnapshot {
  pan: { x: number; y: number };
  zoom: number;
}

interface AxisPenetration {
  axis: "x" | "y";
  overlap: number;
  direction: number;
}

function snapshotViewport(cy: Core): ViewportSnapshot {
  return {
    pan: cy.pan(),
    zoom: cy.zoom(),
  };
}

function restoreDragViewport(cy: Core): void {
  const snapshot = cy.scratch(DRAG_VIEWPORT_KEY) as ViewportSnapshot | undefined;
  if (!snapshot) {
    return;
  }
  cy.viewport({
    pan: snapshot.pan,
    zoom: snapshot.zoom,
  });
}

function overlapArea(left: VisualBox, right: VisualBox): number {
  const overlapX = Math.min(left.x2, right.x2) - Math.max(left.x1, right.x1);
  const overlapY = Math.min(left.y2, right.y2) - Math.max(left.y1, right.y1);
  if (overlapX <= 0 || overlapY <= 0) {
    return 0;
  }
  return overlapX * overlapY;
}

// Returns the minimum-translation axis, overlap depth, and the direction the
// moving box must travel to reduce that overlap.
function minTranslationPenetration(moving: VisualBox, fixed: VisualBox): AxisPenetration | null {
  const overlapX = Math.min(moving.x2, fixed.x2) - Math.max(moving.x1, fixed.x1);
  const overlapY = Math.min(moving.y2, fixed.y2) - Math.max(moving.y1, fixed.y1);
  if (overlapX <= 0 || overlapY <= 0) {
    return null;
  }

  if (overlapX < overlapY) {
    const direction = (moving.x1 + moving.x2) / 2 < (fixed.x1 + fixed.x2) / 2 ? -1 : 1;
    return { axis: "x", overlap: overlapX, direction };
  }

  const direction = (moving.y1 + moving.y2) / 2 < (fixed.y1 + fixed.y2) / 2 ? -1 : 1;
  return { axis: "y", overlap: overlapY, direction };
}

function deepestOverlappingSibling(node: NodeSingular): NodeSingular | null {
  const movingBox = nodeVisualBox(node);
  let deepest: NodeSingular | null = null;
  let deepestArea = 0;

  for (const other of siblingNodesForDrag(node)) {
    const area = overlapArea(movingBox, nodeVisualBox(other));
    if (area > deepestArea) {
      deepestArea = area;
      deepest = other;
    }
  }

  return deepest;
}

// Applies resistance and a hard 25% cap to the node's penetration into its
// deepest-overlapping sibling, relative to the cursor-driven desired position.
function dampenSiblingPenetration(node: NodeSingular, desired: NodePosition): void {
  const sibling = deepestOverlappingSibling(node);
  if (!sibling) {
    return;
  }

  const movingBox = nodeVisualBox(node);
  const siblingBox = nodeVisualBox(sibling);
  const penetration = minTranslationPenetration(movingBox, siblingBox);
  if (!penetration) {
    return;
  }

  const movingExtent =
    penetration.axis === "x" ? movingBox.x2 - movingBox.x1 : movingBox.y2 - movingBox.y1;
  const siblingExtent =
    penetration.axis === "x" ? siblingBox.x2 - siblingBox.x1 : siblingBox.y2 - siblingBox.y1;
  const maxPenetration = DRAG_MAX_PENETRATION_RATIO * Math.min(movingExtent, siblingExtent);

  const allowed = Math.min(penetration.overlap * DRAG_OVERLAP_RESISTANCE, maxPenetration);
  const pullBack = penetration.overlap - allowed;
  if (pullBack <= 0) {
    return;
  }

  node.position({
    x: penetration.axis === "x" ? desired.x + penetration.direction * pullBack : desired.x,
    y: penetration.axis === "y" ? desired.y + penetration.direction * pullBack : desired.y,
  });
}

// Moves only the dragged node fully out of every sibling it overlaps, so the
// final resting position never overlaps another node (including titles).
function separateDraggedNode(node: NodeSingular): void {
  for (let iteration = 0; iteration < MAX_OVERLAP_RESOLUTION_ITERATIONS; iteration++) {
    const sibling = deepestOverlappingSibling(node);
    if (!sibling) {
      return;
    }

    const { dx, dy } = separationToClearOverlap(nodeVisualBox(node), nodeVisualBox(sibling));
    if (dx === 0 && dy === 0) {
      return;
    }
    moveNodeBy(node, dx, dy);
  }
}

/**
 * Constrains node drags: allows limited, resisted overlap while dragging and
 * guarantees a non-overlapping final position, without moving other nodes or
 * changing the viewport.
 * @param cy - Cytoscape instance containing the graph nodes.
 * @param onDragComplete - Called with the final node position after drag ends.
 * @returns Cleanup function that removes drag listeners.
 */
export function installDragOverlapConstraints(
  cy: Core,
  onDragComplete?: (nodeId: string, position: NodePosition) => void,
): () => void {
  const grabOffset = (node: NodeSingular): NodePosition =>
    (node.scratch(DRAG_GRAB_OFFSET_KEY) as NodePosition | undefined) ?? { x: 0, y: 0 };

  const constrainDraggedNode = (node: NodeSingular, cursor?: NodePosition) => {
    if (node.scratch(DRAG_POSITION_LOCK_KEY)) {
      return;
    }

    node.scratch(DRAG_POSITION_LOCK_KEY, true);

    const offset = grabOffset(node);
    const desired = cursor
      ? { x: cursor.x + offset.x, y: cursor.y + offset.y }
      : { x: node.position().x, y: node.position().y };

    node.position(desired);

    if (nodeEscapesCompoundParent(node)) {
      const lastValid = node.scratch(DRAG_LAST_VALID_KEY) as NodePosition | undefined;
      if (lastValid) {
        node.position(lastValid);
      }
      node.scratch(DRAG_POSITION_LOCK_KEY, false);
      restoreDragViewport(cy);
      return;
    }

    dampenSiblingPenetration(node, desired);

    const settled = node.position();
    node.scratch(DRAG_LAST_VALID_KEY, { x: settled.x, y: settled.y });
    node.scratch(DRAG_POSITION_LOCK_KEY, false);
    restoreDragViewport(cy);
  };

  const onGrab = (event: EventObject) => {
    const node = event.target;
    const position = node.position();
    const cursor = event.position;
    cy.scratch(DRAG_VIEWPORT_KEY, snapshotViewport(cy));
    node.scratch(DRAG_LAST_VALID_KEY, { x: position.x, y: position.y });
    node.scratch(
      DRAG_GRAB_OFFSET_KEY,
      cursor ? { x: position.x - cursor.x, y: position.y - cursor.y } : { x: 0, y: 0 },
    );
  };

  const onDrag = (event: EventObject) => {
    constrainDraggedNode(event.target, event.position);
  };

  const onPosition = (event: EventObject) => {
    const node = event.target;
    if (!node.grabbed()) {
      return;
    }
    constrainDraggedNode(node);
  };

  const onDragFree = (event: EventObject) => {
    const node = event.target;
    node.scratch(DRAG_POSITION_LOCK_KEY, true);
    separateDraggedNode(node);
    node.scratch(DRAG_POSITION_LOCK_KEY, false);
    restoreDragViewport(cy);

    const position = node.position();
    node.removeScratch(DRAG_LAST_VALID_KEY);
    node.removeScratch(DRAG_GRAB_OFFSET_KEY);
    node.removeScratch(DRAG_POSITION_LOCK_KEY);
    cy.removeScratch(DRAG_VIEWPORT_KEY);
    onDragComplete?.(node.id(), { x: position.x, y: position.y });
  };

  cy.on("grab", "node", onGrab);
  cy.on("drag", "node", onDrag);
  cy.on("position", "node", onPosition);
  cy.on("dragfree", "node", onDragFree);

  return () => {
    cy.removeListener("grab", "node", onGrab);
    cy.removeListener("drag", "node", onDrag);
    cy.removeListener("position", "node", onPosition);
    cy.removeListener("dragfree", "node", onDragFree);
  };
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
    cy.layout(PRESET_LAYOUT).run();
    resolveNodeOverlaps(cy);
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
