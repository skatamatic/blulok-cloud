import { getWidgetType } from '@/config/widgetRegistry';
import { WidgetSize } from '@/types/widget.types';
import {
  sizeToGrid,
  isValidSize,
  isDockSize,
  snapGridToAllowedSize,
  gridBoundsForAllowedSizes,
  orderSizesForPlacement,
  allowedSizesForWidget,
  standardSizesForWidget,
} from '@/utils/widget-size.utils';
export { GRID_COLS, GRID_ROWS } from '@/utils/dashboard-grid.constants';
import { GRID_COLS, GRID_ROWS } from '@/utils/dashboard-grid.constants';

export { isDockSize } from '@/utils/widget-size.utils';

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function dockPlacement(size: WidgetSize): Omit<GridLayoutItem, 'i'> | null {
  switch (size) {
    case 'dock-top':
      return { x: 0, y: 0, w: 12, h: 3 };
    case 'dock-bottom':
      return { x: 0, y: 3, w: 12, h: 3 };
    case 'dock-left':
      return { x: 0, y: 0, w: 6, h: GRID_ROWS };
    case 'dock-right':
      return { x: 6, y: 0, w: 6, h: GRID_ROWS };
    case 'dock-bottom-two-thirds':
      return { x: 0, y: 2, w: 12, h: 4 };
    case 'dock-full':
      return { x: 0, y: 0, w: 12, h: GRID_ROWS };
    default:
      return null;
  }
}

export function layoutItemFromSize(
  widgetId: string,
  size: WidgetSize,
  x?: number,
  y?: number
): GridLayoutItem {
  const dock = dockPlacement(size);
  if (dock) {
    return { ...dock, i: widgetId };
  }
  const { w, h } = sizeToGrid(size);
  return {
    i: widgetId,
    x: x ?? 0,
    y: y ?? 0,
    w,
    h,
  };
}

function itemsOverlap(a: GridLayoutItem, b: GridLayoutItem): boolean {
  if (a.i === b.i) return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** True when any two distinct free widgets overlap on the grid. */
export function hasFreeWidgetOverlap(items: GridLayoutItem[]): boolean {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (itemsOverlap(items[i], items[j])) {
        return true;
      }
    }
  }
  return false;
}

type GridRect = { left: number; top: number; right: number; bottom: number };

function itemToGridRect(item: GridLayoutItem): GridRect {
  return {
    left: item.x,
    top: item.y,
    right: item.x + item.w,
    bottom: item.y + item.h,
  };
}

function gridRectToItem(id: string, rect: GridRect): GridLayoutItem {
  return {
    i: id,
    x: rect.left,
    y: rect.top,
    w: rect.right - rect.left,
    h: rect.bottom - rect.top,
  };
}

function gridRectOverlapsItem(rect: GridRect, item: GridLayoutItem): boolean {
  const other = itemToGridRect(item);
  return (
    rect.left < other.right &&
    rect.right > other.left &&
    rect.top < other.bottom &&
    rect.bottom > other.top
  );
}

function gridRectContainsPoint(rect: GridRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

function gridRectArea(rect: GridRect): number {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

function gridRectsEqual(a: GridRect, b: GridRect): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

/** Largest axis-aligned rect containing the grid center that avoids obstacles. */
function computeDockFullRect(
  id: string,
  obstacles: GridLayoutItem[],
  cols: number,
  maxRows: number,
  bounds: { minW: number; minH: number; maxW: number; maxH: number }
): GridLayoutItem {
  const centerX = cols / 2;
  const centerY = maxRows / 2;
  let rect: GridRect = { left: 0, top: 0, right: cols, bottom: maxRows };

  const maxIterations = Math.max(8, obstacles.length * 4);
  for (let pass = 0; pass < maxIterations; pass += 1) {
    let changed = false;
    for (const obstacle of obstacles) {
      if (!gridRectOverlapsItem(rect, obstacle)) continue;

      const candidates: GridRect[] = [
        { left: rect.left, top: obstacle.y + obstacle.h, right: rect.right, bottom: rect.bottom },
        { left: rect.left, top: rect.top, right: rect.right, bottom: obstacle.y },
        { left: obstacle.x + obstacle.w, top: rect.top, right: rect.right, bottom: rect.bottom },
        { left: rect.left, top: rect.top, right: obstacle.x, bottom: rect.bottom },
      ].filter(
        (candidate) =>
          candidate.right - candidate.left >= bounds.minW &&
          candidate.bottom - candidate.top >= bounds.minH &&
          gridRectContainsPoint(candidate, centerX, centerY) &&
          !gridRectOverlapsItem(candidate, obstacle)
      );

      if (candidates.length === 0) continue;

      const best = candidates.reduce((winner, candidate) =>
        gridRectArea(candidate) > gridRectArea(winner) ? candidate : winner
      );

      if (!gridRectsEqual(best, rect)) {
        rect = best;
        changed = true;
      }
    }
    if (!changed) break;
  }

  let w = rect.right - rect.left;
  let h = rect.bottom - rect.top;
  if (w < bounds.minW) {
    const midX = (rect.left + rect.right) / 2;
    rect.left = Math.max(0, Math.round(midX - bounds.minW / 2));
    rect.right = Math.min(cols, rect.left + bounds.minW);
    rect.left = rect.right - bounds.minW;
  }
  if (h < bounds.minH) {
    const midY = (rect.top + rect.bottom) / 2;
    rect.top = Math.max(0, Math.round(midY - bounds.minH / 2));
    rect.bottom = Math.min(maxRows, rect.top + bounds.minH);
    rect.top = rect.bottom - bounds.minH;
  }

  return snapGridItem(gridRectToItem(id, rect), cols, maxRows);
}

function pushFreeWidgetOutOfDockFull(
  item: GridLayoutItem,
  dock: GridLayoutItem,
  cols: number,
  maxRows: number
): GridLayoutItem {
  const originCenterX = item.x + item.w / 2;
  const originCenterY = item.y + item.h / 2;

  const candidates = [
    { ...item, y: dock.y - item.h },
    { ...item, y: dock.y + dock.h },
    { ...item, x: dock.x - item.w },
    { ...item, x: dock.x + dock.w },
  ]
    .map((candidate) => snapGridItem(candidate, cols, maxRows))
    .filter((candidate) => !itemsOverlap(candidate, dock));

  if (candidates.length === 0) {
    return snapGridItem({ ...item, y: Math.max(0, dock.y - item.h) }, cols, maxRows);
  }

  return candidates.reduce((best, candidate) => {
    const bestCenterX = best.x + best.w / 2;
    const bestCenterY = best.y + best.h / 2;
    const candidateCenterX = candidate.x + candidate.w / 2;
    const candidateCenterY = candidate.y + candidate.h / 2;
    const bestDist =
      Math.abs(bestCenterX - originCenterX) + Math.abs(bestCenterY - originCenterY);
    const candidateDist =
      Math.abs(candidateCenterX - originCenterX) + Math.abs(candidateCenterY - originCenterY);
    return candidateDist < bestDist ? candidate : best;
  });
}

/** Snap to integer grid cells and keep within the fixed dashboard bounds. */
export function snapGridItem(
  item: GridLayoutItem,
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem {
  return clampItemToGrid(
    {
      ...item,
      x: Math.round(item.x),
      y: Math.round(item.y),
      w: Math.max(1, Math.round(item.w)),
      h: Math.max(1, Math.round(item.h)),
    },
    cols,
    maxRows
  );
}

export function validateLayout(
  items: GridLayoutItem[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): { valid: boolean; error?: string } {
  for (const item of items) {
    if (item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1) {
      return { valid: false, error: `Invalid dimensions for widget ${item.i}` };
    }
    if (item.x + item.w > cols) {
      return { valid: false, error: `Widget ${item.i} exceeds grid width` };
    }
    if (item.y + item.h > maxRows) {
      return { valid: false, error: `Widget ${item.i} exceeds grid height` };
    }
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (itemsOverlap(items[i], items[j])) {
        return {
          valid: false,
          error: `Widgets ${items[i].i} and ${items[j].i} overlap`,
        };
      }
    }
  }

  return { valid: true };
}

export function findPlacement(
  existing: GridLayoutItem[],
  size: WidgetSize,
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem | null {
  const dock = dockPlacement(size);
  if (dock) {
    const candidate: GridLayoutItem = { ...dock, i: '__placement__' };
    const { valid } = validateLayout([...existing, candidate], cols, maxRows);
    if (valid) {
      return candidate;
    }
    return null;
  }

  const { w, h } = sizeToGrid(size);
  for (let y = 0; y <= maxRows - h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const candidate: GridLayoutItem = {
        i: '__placement__',
        x,
        y,
        w,
        h,
      };
      const { valid } = validateLayout([...existing, candidate], cols, maxRows);
      if (valid) {
        return candidate;
      }
    }
  }
  return null;
}

export interface WidgetLayoutInstance {
  id: string;
  type: string;
  size: WidgetSize;
}

function clampItemToGrid(
  item: GridLayoutItem,
  cols: number,
  maxRows: number
): GridLayoutItem {
  let next = { ...item };
  if (next.w > cols) next.w = cols;
  if (next.h > maxRows) next.h = maxRows;
  if (next.x + next.w > cols) next.x = Math.max(0, cols - next.w);
  if (next.y + next.h > maxRows) next.y = Math.max(0, maxRows - next.h);
  if (next.x < 0) next.x = 0;
  if (next.y < 0) next.y = 0;
  return next;
}

function dockPresetArea(size: WidgetSize): number {
  const { w, h } = sizeToGrid(size);
  return w * h;
}

/**
 * Intrinsic dock min/max — independent of the widget's other allowed sizes so
 * docks can always shrink along their anchor axis to make room for free widgets.
 */
export function dockBounds(
  size: WidgetSize,
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): { minW: number; minH: number; maxW: number; maxH: number } {
  switch (size) {
    case 'dock-top':
    case 'dock-bottom':
      return { minW: cols, minH: 1, maxW: cols, maxH: 3 };
    case 'dock-bottom-two-thirds':
      return { minW: cols, minH: 2, maxW: cols, maxH: 4 };
    case 'dock-left':
    case 'dock-right':
      return { minW: 3, minH: maxRows, maxW: 6, maxH: maxRows };
    case 'dock-full':
      return { minW: 3, minH: 2, maxW: cols, maxH: maxRows };
    default:
      return { minW: 1, minH: 1, maxW: cols, maxH: maxRows };
  }
}

/**
 * Smallest rect the given dock can occupy at its anchor side. Used as the
 * drag-preview placement so free widgets can be dragged into the space the
 * dock would otherwise occupy. The actual final dock rect is computed by
 * `layoutWithFlexibleDocks` once the drag completes.
 */
export function dockMinPlacement(
  size: WidgetSize,
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): Omit<GridLayoutItem, 'i'> | null {
  const bounds = dockBounds(size, cols, maxRows);
  switch (size) {
    case 'dock-top':
      return { x: 0, y: 0, w: cols, h: bounds.minH };
    case 'dock-bottom':
    case 'dock-bottom-two-thirds':
      return { x: 0, y: maxRows - bounds.minH, w: cols, h: bounds.minH };
    case 'dock-full': {
      const w = bounds.minW;
      const h = bounds.minH;
      return {
        x: Math.max(0, Math.floor((cols - w) / 2)),
        y: Math.max(0, Math.floor((maxRows - h) / 2)),
        w,
        h,
      };
    }
    case 'dock-left':
      return { x: 0, y: 0, w: bounds.minW, h: maxRows };
    case 'dock-right':
      return { x: cols - bounds.minW, y: 0, w: bounds.minW, h: maxRows };
    default:
      return null;
  }
}

/**
 * Build a "drag preview" layout where each dock is shrunk to its minimum rect.
 * This is fed to react-grid-layout while a drag is active so the user can drop
 * widgets into the space the dock would otherwise occupy. On drop, the real
 * dock geometry is recomputed by `layoutWithFlexibleDocks`.
 */
export function buildDragPreviewLg(
  layouts: GridLayoutItem[],
  instances: Array<{ id: string; size: WidgetSize }>,
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem[] {
  const sizeById = new Map(instances.map((i) => [i.id, i.size]));
  return layouts.map((item) => {
    const size = sizeById.get(item.i);
    if (!size || !isDockSize(size)) return item;
    const min = dockMinPlacement(size, cols, maxRows);
    if (!min) return item;
    return { ...item, ...min };
  });
}

/**
 * Given the free widgets, compute this dock's actual rect on the grid.
 * The dock shrinks along its anchor axis to expose any intruding widget,
 * stopping at its intrinsic min size.
 */
function computeFlexDockRect(
  inst: WidgetLayoutInstance,
  obstacles: GridLayoutItem[],
  cols: number,
  maxRows: number
): GridLayoutItem | null {
  const preset = dockPlacement(inst.size);
  if (!preset) return null;

  const bounds = dockBounds(inst.size, cols, maxRows);
  const id = inst.id;

  switch (inst.size) {
    case 'dock-full':
      return computeDockFullRect(id, obstacles, cols, maxRows, bounds);
    case 'dock-bottom':
    case 'dock-bottom-two-thirds': {
      const defaultH = preset.h;
      const defaultTop = maxRows - defaultH;
      const intruders = obstacles.filter((w) => w.y + w.h > defaultTop);
      let top = defaultTop;
      if (intruders.length > 0) {
        const maxBottom = Math.max(...intruders.map((w) => w.y + w.h));
        top = Math.max(defaultTop, maxBottom);
      }
      top = Math.min(top, maxRows - bounds.minH);
      top = Math.max(0, top);
      return { i: id, x: 0, y: top, w: cols, h: maxRows - top };
    }
    case 'dock-top': {
      // Anchor top; h shrinks from the bottom edge upward.
      const defaultH = preset.h;
      const intruders = obstacles.filter((w) => w.y < defaultH);
      let h = defaultH;
      if (intruders.length > 0) {
        const minTop = Math.min(...intruders.map((w) => w.y));
        h = Math.min(defaultH, minTop);
      }
      h = Math.max(h, bounds.minH);
      h = Math.min(h, maxRows);
      return { i: id, x: 0, y: 0, w: cols, h };
    }
    case 'dock-left': {
      const defaultW = preset.w;
      const intruders = obstacles.filter((w) => w.x < defaultW);
      let w = defaultW;
      if (intruders.length > 0) {
        const minLeft = Math.min(...intruders.map((wi) => wi.x));
        w = Math.min(defaultW, minLeft);
      }
      w = Math.max(w, bounds.minW);
      w = Math.min(w, cols);
      return { i: id, x: 0, y: 0, w, h: maxRows };
    }
    case 'dock-right': {
      const defaultLeft = preset.x;
      const intruders = obstacles.filter((w) => w.x + w.w > defaultLeft);
      let left = defaultLeft;
      if (intruders.length > 0) {
        const maxRight = Math.max(...intruders.map((w) => w.x + w.w));
        left = Math.max(defaultLeft, maxRight);
      }
      left = Math.min(left, cols - bounds.minW);
      left = Math.max(0, left);
      return { i: id, x: left, y: 0, w: cols - left, h: maxRows };
    }
    default:
      return null;
  }
}

/** Move a free widget out of a dock region along the dock's shrink axis. */
function pushFreeWidgetOutOfDock(
  item: GridLayoutItem,
  dock: GridLayoutItem,
  dockSize: WidgetSize,
  cols: number,
  maxRows: number
): GridLayoutItem {
  if (!itemsOverlap(item, dock)) return item;

  switch (dockSize) {
    case 'dock-full':
      return pushFreeWidgetOutOfDockFull(item, dock, cols, maxRows);
    case 'dock-bottom':
    case 'dock-bottom-two-thirds':
      return snapGridItem(
        { ...item, y: Math.max(0, dock.y - item.h) },
        cols,
        maxRows
      );
    case 'dock-top':
      return snapGridItem(
        { ...item, y: Math.min(maxRows - item.h, dock.y + dock.h) },
        cols,
        maxRows
      );
    case 'dock-left':
      return snapGridItem(
        { ...item, x: Math.min(cols - item.w, dock.x + dock.w) },
        cols,
        maxRows
      );
    case 'dock-right':
      return snapGridItem(
        { ...item, x: Math.max(0, dock.x - item.w) },
        cols,
        maxRows
      );
    default:
      return item;
  }
}

/** Resolve free-vs-free overlaps by nudging the lower/right item up/left. */
function deconflictFreeWidgets(
  items: GridLayoutItem[],
  cols: number,
  maxRows: number
): GridLayoutItem[] {
  let result = items.map((i) => snapGridItem(i, cols, maxRows));
  const maxPasses = Math.max(4, result.length * 2);

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        if (!itemsOverlap(result[i], result[j])) continue;
        const lowerIdx = result[i].y >= result[j].y ? i : j;
        const upperIdx = lowerIdx === i ? j : i;
        const lower = result[lowerIdx];
        const upper = result[upperIdx];
        const nextY = Math.max(0, upper.y - lower.h);
        const nudged = snapGridItem({ ...lower, y: nextY }, cols, maxRows);
        if (nudged.y !== lower.y || nudged.x !== lower.x) {
          result[lowerIdx] = nudged;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return result;
}

/**
 * Layout free widgets at their drag positions, then size each dock so it
 * shrinks along its anchor axis to expose any intruding free widget (down to
 * the dock's intrinsic min size). If a dock can't shrink far enough, free
 * widgets are nudged out of the dock's final rect along the same axis.
 */
export function layoutWithFlexibleDocks(
  freeItems: GridLayoutItem[],
  instances: WidgetLayoutInstance[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem[] {
  const dockInstances = instances.filter((i) => isDockSize(i.size));
  const dockIdSet = new Set(dockInstances.map((i) => i.id));

  let free = freeItems
    .filter((item) => !dockIdSet.has(item.i))
    .map((item) => snapGridItem(item, cols, maxRows));

  if (dockInstances.length === 0) {
    return deconflictFreeWidgets(free, cols, maxRows);
  }

  // Larger preset docks first so smaller ones fit around them deterministically.
  const orderedDocks = [...dockInstances].sort(
    (a, b) => dockPresetArea(b.size) - dockPresetArea(a.size)
  );

  // First pass — compute dock rects from current free positions.
  const placedDocks: GridLayoutItem[] = [];
  for (const dock of orderedDocks) {
    const obstacles = [...free, ...placedDocks];
    const rect = computeFlexDockRect(dock, obstacles, cols, maxRows);
    if (rect) placedDocks.push(rect);
  }

  // Push free widgets out of any dock rect that hit its min size and still overlaps.
  for (const dock of orderedDocks) {
    const rect = placedDocks.find((r) => r.i === dock.id);
    if (!rect) continue;
    free = free.map((item) =>
      pushFreeWidgetOutOfDock(item, rect, dock.size, cols, maxRows)
    );
  }

  // Recompute dock rects now that free widgets settled.
  const finalDocks: GridLayoutItem[] = [];
  for (const dock of orderedDocks) {
    const obstacles = [...free, ...finalDocks];
    const rect = computeFlexDockRect(dock, obstacles, cols, maxRows);
    if (rect) finalDocks.push(rect);
  }

  // Resolve free-vs-free collisions that may have surfaced from pushing.
  free = deconflictFreeWidgets(free, cols, maxRows);

  return [...free, ...finalDocks];
}

/**
 * Strict drop validation: returns `accepted: false` whenever a free widget in
 * the proposed layout cannot keep its proposed position after the dock-aware
 * reflow runs, OR when the proposed positions still overlap each other (the
 * reflow's deconfliction does not resolve horizontal overlaps at the same y).
 * This is what we use on drag/resize stop to revert invalid placements
 * (overlap with another free widget, or overlap with a dock that has already
 * shrunk to its minimum). The `reflowed` layout (with docks shrunk around the
 * new positions) is returned in both cases — when accepted you commit it,
 * when rejected you discard it and revert.
 */
export function validateProposedFreeLayout(
  proposedFree: GridLayoutItem[],
  instances: WidgetLayoutInstance[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): { accepted: boolean; reflowed: GridLayoutItem[] } {
  const snapped = proposedFree.map((item) => snapGridItem(item, cols, maxRows));

  // Reject any free-vs-free overlap up front. Reflow's deconflict only moves
  // items vertically along the y-axis when one is strictly below another, so
  // two free widgets that overlap horizontally at the same row would slip
  // through the position-equality check below.
  for (let i = 0; i < snapped.length; i++) {
    for (let j = i + 1; j < snapped.length; j++) {
      if (itemsOverlap(snapped[i], snapped[j])) {
        return {
          accepted: false,
          reflowed: layoutWithFlexibleDocks(snapped, instances, cols, maxRows),
        };
      }
    }
  }

  const reflowed = layoutWithFlexibleDocks(snapped, instances, cols, maxRows);

  if (!evaluateReflowAcceptance(snapped, reflowed, instances)) {
    return { accepted: false, reflowed };
  }

  return { accepted: true, reflowed };
}

/** Compact signature for a grid item's cell geometry (used to skip redundant live reflow). */
export function liveGridGestureSig(
  item: Pick<GridLayoutItem, 'x' | 'y' | 'w' | 'h'>
): string {
  return `${item.x},${item.y},${item.w}x${item.h}`;
}

function dockRectsFromReflowed(
  reflowed: GridLayoutItem[],
  instances: WidgetLayoutInstance[]
): Map<string, GridLayoutItem> {
  const dockIds = new Set(
    instances.filter((i) => isDockSize(i.size)).map((i) => i.id)
  );
  const map = new Map<string, GridLayoutItem>();
  for (const item of reflowed) {
    if (dockIds.has(item.i)) map.set(item.i, item);
  }
  return map;
}

function evaluateReflowAcceptance(
  proposedSnapped: GridLayoutItem[],
  reflowed: GridLayoutItem[],
  instances: WidgetLayoutInstance[]
): boolean {
  const finalById = new Map(reflowed.map((i) => [i.i, i]));
  for (const item of proposedSnapped) {
    const final = finalById.get(item.i);
    if (!final) return false;
    if (
      final.x !== item.x ||
      final.y !== item.y ||
      final.w !== item.w ||
      final.h !== item.h
    ) {
      return false;
    }
  }

  const dockIds = new Set(
    instances.filter((i) => isDockSize(i.size)).map((i) => i.id)
  );
  const freeReflowed = reflowed.filter((r) => !dockIds.has(r.i));
  const docksReflowed = reflowed.filter((r) => dockIds.has(r.i));
  for (const f of freeReflowed) {
    for (const d of docksReflowed) {
      if (itemsOverlap(f, d)) {
        return false;
      }
    }
  }

  return true;
}

export interface LiveDockGestureResult {
  rects: Map<string, GridLayoutItem>;
  accepted: boolean;
}

/**
 * Single-pass live drag/resize preview: dock shrink rects plus placement
 * validity. Avoids running `layoutWithFlexibleDocks` twice per gesture tick.
 */
export function computeLiveDockGesture(
  freeItems: GridLayoutItem[],
  liveItem: GridLayoutItem,
  instances: WidgetLayoutInstance[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): LiveDockGestureResult {
  const liveSnapped = snapGridItem(liveItem, cols, maxRows);
  const free = freeItems.map((item) =>
    item.i === liveItem.i ? liveSnapped : snapGridItem(item, cols, maxRows)
  );

  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (itemsOverlap(free[i], free[j])) {
        const reflowed = layoutWithFlexibleDocks(free, instances, cols, maxRows);
        return {
          rects: dockRectsFromReflowed(reflowed, instances),
          accepted: false,
        };
      }
    }
  }

  const reflowed = layoutWithFlexibleDocks(free, instances, cols, maxRows);
  return {
    rects: dockRectsFromReflowed(reflowed, instances),
    accepted: evaluateReflowAcceptance(free, reflowed, instances),
  };
}

/**
 * Compute the dock geometry the layout would settle into if the given free
 * widget moved to `liveItem`. Used during drag to render docks at their
 * "would-be" shrunk size in real time. Returns a map of dock id → rect.
 */
export function computeLiveDockRects(
  freeItems: GridLayoutItem[],
  liveItem: GridLayoutItem,
  instances: WidgetLayoutInstance[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): Map<string, GridLayoutItem> {
  return computeLiveDockGesture(freeItems, liveItem, instances, cols, maxRows)
    .rects;
}

/**
 * Recompute dock widget geometry so non-dock items keep their positions and
 * docked widgets shrink (down to widget min preset) to avoid overlap.
 */
export function reflowDockLayout(
  items: GridLayoutItem[],
  instances: WidgetLayoutInstance[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem[] {
  return layoutWithFlexibleDocks(items, instances, cols, maxRows);
}

/** Find space for a widget; dock regions shrink to fit rather than blocking placement. */
export function findPlacementWithDockReflow(
  existing: GridLayoutItem[],
  instances: WidgetLayoutInstance[],
  preferredSize: WidgetSize,
  allowedSizes: WidgetSize[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): { placement: Omit<GridLayoutItem, 'i'>; size: WidgetSize } | null {
  const PLACEHOLDER = '__placement__';

  for (const size of orderSizesForPlacement(preferredSize, allowedSizes)) {
    const placeholderType =
      instances.find((i) => !isDockSize(i.size))?.type ?? 'stats-facilities';

    if (isDockSize(size)) {
      const tentativeInstances: WidgetLayoutInstance[] = [
        ...instances.filter((i) => i.id !== PLACEHOLDER),
        { id: PLACEHOLDER, type: placeholderType, size },
      ];
      const reflowed = reflowDockLayout(existing, tentativeInstances, cols, maxRows);
      const placed = reflowed.find((i) => i.i === PLACEHOLDER);
      if (placed) {
        const { i: _id, ...placement } = placed;
        return { placement, size };
      }
      continue;
    }

    const { w, h } = sizeToGrid(size);
    for (let y = 0; y <= maxRows - h; y++) {
      for (let x = 0; x <= cols - w; x++) {
        const candidate: GridLayoutItem = {
          i: PLACEHOLDER,
          x,
          y,
          w,
          h,
        };
        const reflowed = reflowDockLayout(
          [...existing.filter((e) => e.i !== PLACEHOLDER), candidate],
          [
            ...instances.filter((i) => i.id !== PLACEHOLDER),
            { id: PLACEHOLDER, type: placeholderType, size },
          ],
          cols,
          maxRows
        );
        const placed = reflowed.find((i) => i.i === PLACEHOLDER);
        if (placed && validateLayout(reflowed, cols, maxRows).valid) {
          const { i: _id, ...placement } = placed;
          return { placement, size };
        }
      }
    }
  }
  return null;
}

/** Find space for a widget, trying smaller allowed sizes when the preferred size does not fit. */
export function findPlacementWithFallback(
  existing: GridLayoutItem[],
  preferredSize: WidgetSize,
  allowedSizes: WidgetSize[]
): { placement: Omit<GridLayoutItem, 'i'>; size: WidgetSize } | null {
  for (const size of orderSizesForPlacement(preferredSize, allowedSizes)) {
    const candidate = findPlacement(existing, size);
    if (!candidate) continue;
    const { i: _id, ...placement } = candidate;
    return { placement, size };
  }
  return null;
}

/** Clamp each layout item to grid bounds; dock items keep dock geometry from reflow. */
export function snapLayoutItemsToWidgetSizes(
  items: GridLayoutItem[],
  instances: Array<{ id: string; type: string; size: WidgetSize }>
): GridLayoutItem[] {
  return items.map((item) => {
    const inst = instances.find((w) => w.id === item.i);
    if (inst && isDockSize(inst.size)) {
      return item;
    }
    return snapGridItem(item);
  });
}

export function enrichLayoutItemsWithResizeConstraints(
  items: GridLayoutItem[],
  instances: Array<{ id: string; type: string; size: WidgetSize }>
): GridLayoutItem[] {
  return items.map((item) => {
    const inst = instances.find((w) => w.id === item.i);
    if (!inst) return item;

    const allowed = isDockSize(inst.size)
      ? allowedSizesForWidget(inst.type, inst.size)
      : standardSizesForWidget(inst.type, inst.size);
    const bounds = gridBoundsForAllowedSizes(allowed);

    return {
      ...item,
      minW: Math.min(bounds.minW, item.w),
      minH: Math.min(bounds.minH, item.h),
      maxW: Math.max(bounds.maxW, item.w),
      maxH: Math.max(bounds.maxH, item.h),
    };
  });
}

function findFreeSlot(
  placed: GridLayoutItem[],
  w: number,
  h: number,
  cols: number,
  maxRows: number
): { x: number; y: number } | null {
  if (w < 1 || h < 1 || w > cols || h > maxRows) return null;
  for (let y = 0; y <= maxRows - h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const candidate: GridLayoutItem = { i: '__probe__', x, y, w, h };
      if (validateLayout([...placed, candidate], cols, maxRows).valid) {
        return { x, y };
      }
    }
  }
  return null;
}

export function clampLayout(
  items: GridLayoutItem[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: GridLayoutItem[] = [];

  for (const item of sorted) {
    let next = { ...item };

    if (next.w > cols) next.w = cols;
    if (next.h > maxRows) next.h = maxRows;

    if (next.x + next.w > cols) {
      next.x = Math.max(0, cols - next.w);
    }
    if (next.y + next.h > maxRows) {
      next.y = Math.max(0, maxRows - next.h);
    }

    if (validateLayout([...placed, next], cols, maxRows).valid) {
      placed.push(next);
      continue;
    }

    let slot = findFreeSlot(placed, next.w, next.h, cols, maxRows);
    let finalW = next.w;
    let finalH = next.h;

    while (!slot && (finalW > 1 || finalH > 1)) {
      if (finalW >= finalH && finalW > 1) finalW -= 1;
      else if (finalH > 1) finalH -= 1;
      slot = findFreeSlot(placed, finalW, finalH, cols, maxRows);
    }

    if (slot) {
      placed.push({ i: item.i, x: slot.x, y: slot.y, w: finalW, h: finalH });
    }
  }

  return placed;
}

export function applySizeToLayoutItem(
  item: GridLayoutItem,
  size: WidgetSize
): GridLayoutItem {
  const dock = dockPlacement(size);
  if (dock) {
    return { ...item, ...dock };
  }
  const { w, h } = sizeToGrid(size);
  return { ...item, w, h };
}

export function layoutsFromInstances(
  instances: Array<{ id: string; size: WidgetSize }>,
  existingLayouts: GridLayoutItem[] = []
): { lg: GridLayoutItem[]; md: GridLayoutItem[]; sm: GridLayoutItem[] } {
  const lg: GridLayoutItem[] = [];
  const existingById = new Map(existingLayouts.map((l) => [l.i, l]));

  for (const inst of instances) {
    const prev = existingById.get(inst.id);
    if (prev) {
      const updated = applySizeToLayoutItem(prev, inst.size);
      lg.push(updated);
    } else {
      const placement = findPlacement(lg, inst.size);
      if (placement) {
        lg.push({ ...placement, i: inst.id });
      }
    }
  }

  const clamped = clampLayout(lg);
  const md = clamped.map((item) => ({
    ...item,
    w: Math.min(item.w, 10),
  }));
  const sm = clamped.map((item, index) => ({
    ...item,
    w: 6,
    x: 0,
    y: index * 2,
    h: Math.min(item.h, GRID_ROWS),
  }));

  return { lg: clamped, md, sm };
}

export function buildDefaultStaffLayouts(): {
  lg: GridLayoutItem[];
  md: GridLayoutItem[];
  sm: GridLayoutItem[];
} {
  const lg: GridLayoutItem[] = [
    { i: 'facilities', x: 0, y: 0, w: 3, h: 2 },
    { i: 'devices', x: 3, y: 0, w: 3, h: 2 },
    { i: 'users', x: 6, y: 0, w: 3, h: 2 },
    { i: 'alerts', x: 9, y: 0, w: 3, h: 2 },
    { i: 'notifications', x: 0, y: 2, w: 3, h: 4 },
    { i: 'activity-monitor', x: 3, y: 2, w: 6, h: 2 },
    { i: 'unlocked-units', x: 9, y: 2, w: 3, h: 2 },
    { i: 'battery-status', x: 9, y: 4, w: 3, h: 2 },
    { i: 'units-manager', x: 0, y: 4, w: 12, h: 2 },
  ];
  return {
    lg: clampLayout(lg),
    md: clampLayout(lg).map((item) => ({ ...item, w: Math.min(item.w, 10) })),
    sm: clampLayout(lg).map((item, index) => ({
      ...item,
      w: 6,
      x: 0,
      y: Math.min(index, GRID_ROWS - 1),
      h: 1,
    })),
  };
}

export function buildDefaultTenantLayouts(): {
  lg: GridLayoutItem[];
  md: GridLayoutItem[];
  sm: GridLayoutItem[];
} {
  const lg: GridLayoutItem[] = [
    { i: 'access-history', x: 0, y: 0, w: 4, h: 3 },
    { i: 'notifications', x: 4, y: 0, w: 4, h: 3 },
    { i: 'lock-status', x: 8, y: 0, w: 4, h: 3 },
    { i: 'shared-keys', x: 0, y: 3, w: 6, h: 3 },
    { i: 'daily-access-codes', x: 6, y: 3, w: 6, h: 3 },
  ];
  return {
    lg: clampLayout(lg),
    md: clampLayout(lg).map((item) => ({ ...item, w: Math.min(item.w, 10) })),
    sm: clampLayout(lg).map((item, index) => ({
      ...item,
      w: 6,
      x: 0,
      y: Math.min(index, GRID_ROWS - 1),
      h: 1,
    })),
  };
}

export { isValidSize };
