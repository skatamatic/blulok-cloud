import { WidgetSize } from '@/types/widget.types';
import {
  sizeToGrid,
  isValidSize,
  getAvailableSizes,
} from '@/utils/widget-size.utils';
export { GRID_COLS, GRID_ROWS } from '@/utils/dashboard-grid.constants';
import { GRID_COLS, GRID_ROWS } from '@/utils/dashboard-grid.constants';

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const DOCK_SIZES: WidgetSize[] = [
  'dock-top',
  'dock-bottom',
  'dock-left',
  'dock-right',
  'dock-bottom-two-thirds',
  'dock-full',
];

export function isDockSize(size: WidgetSize): boolean {
  return DOCK_SIZES.includes(size);
}

/** Canonical dock placement (fixed x/y for dock presets). */
export function dockPlacement(
  size: WidgetSize
): Omit<GridLayoutItem, 'i'> | null {
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

  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
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
    const candidate = { ...dock, i: '__placement__' };
    const withCandidate = [...existing, candidate];
    const { valid } = validateLayout(withCandidate, cols, maxRows);
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
  const next = { ...item };
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
 * Intrinsic dock min/max — independent of widget's allowed size set so docks
 * can always shrink along their anchor axis to make room for free widgets.
 */
function dockBounds(
  size: WidgetSize,
  cols: number,
  maxRows: number
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

/**
 * Given the free widgets (and any already-placed docks), compute this dock's
 * actual rect on the grid. The dock shrinks along its anchor axis to expose
 * any intruding widget, stopping at its intrinsic min size.
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

function deconflictFreeWidgets(
  items: GridLayoutItem[],
  cols: number,
  maxRows: number
): GridLayoutItem[] {
  const result = items.map((i) => snapGridItem(i, cols, maxRows));
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
        const nudged = snapGridItem({ ...lower, y: Math.max(0, upper.y - lower.h) }, cols, maxRows);
        if (nudged.y !== lower.y) {
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
 * widgets are pushed out of the dock's final rect along the same axis.
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

  const orderedDocks = [...dockInstances].sort(
    (a, b) => dockPresetArea(b.size) - dockPresetArea(a.size)
  );

  const placedDocks: GridLayoutItem[] = [];
  for (const dock of orderedDocks) {
    const obstacles = [...free, ...placedDocks];
    const rect = computeFlexDockRect(dock, obstacles, cols, maxRows);
    if (rect) placedDocks.push(rect);
  }

  for (const dock of orderedDocks) {
    const rect = placedDocks.find((r) => r.i === dock.id);
    if (!rect) continue;
    free = free.map((item) =>
      pushFreeWidgetOutOfDock(item, rect, dock.size, cols, maxRows)
    );
  }

  const finalDocks: GridLayoutItem[] = [];
  for (const dock of orderedDocks) {
    const obstacles = [...free, ...finalDocks];
    const rect = computeFlexDockRect(dock, obstacles, cols, maxRows);
    if (rect) finalDocks.push(rect);
  }

  free = deconflictFreeWidgets(free, cols, maxRows);

  return [...free, ...finalDocks];
}

/** Recompute dock geometry around fixed non-dock widget positions. */
export function reflowDockLayout(
  items: GridLayoutItem[],
  instances: WidgetLayoutInstance[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem[] {
  return layoutWithFlexibleDocks(items, instances, cols, maxRows);
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

/** Clamp legacy layouts into the fixed grid; preserve original size when possible, only shrink as last resort. */
export function clampLayout(
  items: GridLayoutItem[],
  cols: number = GRID_COLS,
  maxRows: number = GRID_ROWS
): GridLayoutItem[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: GridLayoutItem[] = [];

  for (const item of sorted) {
    const next = { ...item };

    if (next.w > cols) next.w = cols;
    if (next.h > maxRows) next.h = maxRows;
    if (next.x + next.w > cols) next.x = Math.max(0, cols - next.w);
    if (next.y + next.h > maxRows) next.y = Math.max(0, maxRows - next.h);

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

export function validateLayoutConfig(
  position: { x: number; y: number; w: number; h: number },
  size: string
): { valid: boolean; error?: string } {
  if (!isValidSize(size)) {
    return { valid: false, error: `Invalid size: ${size}` };
  }
  const item: GridLayoutItem = {
    i: 'validation',
    x: position.x,
    y: position.y,
    w: position.w,
    h: position.h,
  };
  return validateLayout([item]);
}

/** Keep in sync with WIDGET_SIZE_TO_GRID — used by Joi layout save validation. */
export const WIDGET_SIZE_ENUM = getAvailableSizes();
