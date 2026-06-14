/**
 * BluDesign panel layout v9: floating + optional left/right docks (tabbed).
 * Migrates v8 layouts (no placement / docks).
 */

import type { PanelState } from './FloatingPanel';

export const ALL_PANEL_IDS = [
  'tools',
  'assets',
  'smartobjects',
  'view',
  'defaultCamera',
  'importPlan',
  'properties',
  'floors',
  'skins',
  'datasource',
  'buildingSkin',
] as const;

export type PanelId = (typeof ALL_PANEL_IDS)[number];

export type PanelPlacement = 'float' | 'dock-left' | 'dock-right';

export interface ExtendedPanelStateV9 extends PanelState {
  visible: boolean;
  relX?: number;
  relY?: number;
  /** Where the panel is rendered; default `float`. */
  placement: PanelPlacement;
}

export interface DockSideState {
  panelIds: PanelId[];
  activeId: PanelId | null;
  expanded: boolean;
  widthPx: number;
}

export interface PanelLayoutStateV9 {
  tools: ExtendedPanelStateV9;
  assets: ExtendedPanelStateV9;
  view: ExtendedPanelStateV9;
  defaultCamera: ExtendedPanelStateV9;
  importPlan: ExtendedPanelStateV9;
  properties: ExtendedPanelStateV9;
  floors: ExtendedPanelStateV9;
  skins: ExtendedPanelStateV9;
  datasource: ExtendedPanelStateV9;
  smartobjects: ExtendedPanelStateV9;
  buildingSkin: ExtendedPanelStateV9;
  docks: {
    left: DockSideState;
    right: DockSideState;
  };
}

export const DEFAULT_DOCK_WIDTH_PX = 280;
/** Collapsed dock: floating stack only — nominal width for layout hints (actual UI is `w-auto`). */
export const COLLAPSED_DOCK_RAIL_PX = 52;

/** Inner icon stack column when dock is expanded (icon-only; matches DockRegion). */
export const DOCK_STACK_WIDTH_PX = 56;

/** @deprecated Use DOCK_STACK_WIDTH_PX */
export const DOCK_TAB_STRIP_W_PX = DOCK_STACK_WIDTH_PX;

export function defaultDockSideState(): DockSideState {
  return {
    panelIds: [],
    activeId: null,
    expanded: true,
    widthPx: DEFAULT_DOCK_WIDTH_PX,
  };
}

/** Edge zone width (px) for float→dock drop targets. */
export const DOCK_EDGE_ZONE_PX = 72;

/**
 * Merge loaded JSON with defaults; supports v8 (no placement/docks) and v9.
 */
export function mergeLayoutWithDefaultsV9(
  loaded: unknown,
  defaults: PanelLayoutStateV9
): PanelLayoutStateV9 {
  if (!loaded || typeof loaded !== 'object') {
    return { ...defaults };
  }
  const obj = loaded as Record<string, unknown>;

  const result: PanelLayoutStateV9 = {
    ...defaults,
    docks: {
      left: { ...defaults.docks.left },
      right: { ...defaults.docks.right },
    },
  };

  const hasV9Docks = obj.docks && typeof obj.docks === 'object';
  if (hasV9Docks) {
    const d = obj.docks as Record<string, unknown>;
    if (d.left && typeof d.left === 'object') {
      result.docks.left = { ...defaults.docks.left, ...(d.left as Partial<DockSideState>) };
    }
    if (d.right && typeof d.right === 'object') {
      result.docks.right = { ...defaults.docks.right, ...(d.right as Partial<DockSideState>) };
    }
  }

  for (const key of ALL_PANEL_IDS) {
    const loadedPanel = obj[key];
    if (
      loadedPanel &&
      typeof loadedPanel === 'object' &&
      typeof (loadedPanel as ExtendedPanelStateV9).x === 'number' &&
      typeof (loadedPanel as ExtendedPanelStateV9).y === 'number' &&
      typeof (loadedPanel as ExtendedPanelStateV9).visible === 'boolean'
    ) {
      const lp = loadedPanel as Partial<ExtendedPanelStateV9>;
      result[key] = {
        ...defaults[key],
        ...lp,
        placement: lp.placement ?? 'float',
      };
    }
  }

  // If v8 migration: no docks in file — already defaulted above
  if (!hasV9Docks) {
    for (const id of ALL_PANEL_IDS) {
      result[id].placement = 'float';
    }
  }

  return syncDockListsWithPlacement(result);
}

/**
 * Ensure dock panelIds match placement flags (repair drift).
 */
export function syncDockListsWithPlacement(layout: PanelLayoutStateV9): PanelLayoutStateV9 {
  const next: PanelLayoutStateV9 = {
    ...layout,
    docks: {
      left: { ...layout.docks.left, panelIds: [...layout.docks.left.panelIds] },
      right: { ...layout.docks.right, panelIds: [...layout.docks.right.panelIds] },
    },
  };

  const leftSet = new Set(next.docks.left.panelIds);
  const rightSet = new Set(next.docks.right.panelIds);

  for (const id of ALL_PANEL_IDS) {
    const p = next[id].placement;
    if (p === 'dock-left' && !leftSet.has(id)) {
      next.docks.left.panelIds.push(id);
      leftSet.add(id);
    }
    if (p === 'dock-right' && !rightSet.has(id)) {
      next.docks.right.panelIds.push(id);
      rightSet.add(id);
    }
    if (p === 'float') {
      next.docks.left.panelIds = next.docks.left.panelIds.filter((x) => x !== id);
      next.docks.right.panelIds = next.docks.right.panelIds.filter((x) => x !== id);
    }
  }

  // Remove orphan ids from dock lists
  next.docks.left.panelIds = next.docks.left.panelIds.filter((id) => next[id].placement === 'dock-left');
  next.docks.right.panelIds = next.docks.right.panelIds.filter((id) => next[id].placement === 'dock-right');

  // Fix activeId if stale
  for (const side of ['left', 'right'] as const) {
    const dock = next.docks[side];
    if (dock.activeId && !dock.panelIds.includes(dock.activeId)) {
      dock.activeId = dock.panelIds[0] ?? null;
    }
    if (!dock.activeId && dock.panelIds.length > 0) {
      dock.activeId = dock.panelIds[0];
    }
  }

  return next;
}

export function dockPanel(
  layout: PanelLayoutStateV9,
  panelId: PanelId,
  side: 'left' | 'right'
): PanelLayoutStateV9 {
  const next: PanelLayoutStateV9 = JSON.parse(JSON.stringify(layout)) as PanelLayoutStateV9;

  next.docks.left.panelIds = next.docks.left.panelIds.filter((id) => id !== panelId);
  next.docks.right.panelIds = next.docks.right.panelIds.filter((id) => id !== panelId);

  const dock = side === 'left' ? next.docks.left : next.docks.right;
  if (!dock.panelIds.includes(panelId)) {
    dock.panelIds.push(panelId);
  }
  dock.activeId = panelId;

  next[panelId] = {
    ...next[panelId],
    placement: side === 'left' ? 'dock-left' : 'dock-right',
  };

  return syncDockListsWithPlacement(next);
}

export function floatPanel(
  layout: PanelLayoutStateV9,
  panelId: PanelId,
  position: { x: number; y: number; width?: number; height?: number }
): PanelLayoutStateV9 {
  const next: PanelLayoutStateV9 = JSON.parse(JSON.stringify(layout)) as PanelLayoutStateV9;

  next.docks.left.panelIds = next.docks.left.panelIds.filter((id) => id !== panelId);
  next.docks.right.panelIds = next.docks.right.panelIds.filter((id) => id !== panelId);

  for (const s of ['left', 'right'] as const) {
    const dock = next.docks[s];
    if (dock.activeId === panelId) {
      dock.activeId = dock.panelIds[0] ?? null;
    }
  }

  next[panelId] = {
    ...next[panelId],
    placement: 'float',
    x: position.x,
    y: position.y,
    ...(position.width !== undefined ? { width: position.width } : {}),
    ...(position.height !== undefined ? { height: position.height } : {}),
  };

  return syncDockListsWithPlacement(next);
}

export function setDockActive(
  layout: PanelLayoutStateV9,
  side: 'left' | 'right',
  activeId: PanelId | null
): PanelLayoutStateV9 {
  const next = JSON.parse(JSON.stringify(layout)) as PanelLayoutStateV9;
  next.docks[side].activeId = activeId;
  return next;
}

export function setDockExpanded(
  layout: PanelLayoutStateV9,
  side: 'left' | 'right',
  expanded: boolean
): PanelLayoutStateV9 {
  const next = JSON.parse(JSON.stringify(layout)) as PanelLayoutStateV9;
  next.docks[side].expanded = expanded;
  return next;
}

export function setDockWidth(
  layout: PanelLayoutStateV9,
  side: 'left' | 'right',
  widthPx: number
): PanelLayoutStateV9 {
  const next = JSON.parse(JSON.stringify(layout)) as PanelLayoutStateV9;
  next.docks[side].widthPx = Math.max(220, Math.min(800, widthPx));
  return next;
}

/** Reorder dock tabs. `toIndex` is the insertion index in the array *after* removing `fromIndex`. */
export function reorderDockPanelIds(
  layout: PanelLayoutStateV9,
  side: 'left' | 'right',
  fromIndex: number,
  toIndex: number
): PanelLayoutStateV9 {
  const next = JSON.parse(JSON.stringify(layout)) as PanelLayoutStateV9;
  const ids = next.docks[side].panelIds;
  if (fromIndex < 0 || fromIndex >= ids.length) return layout;
  const [removed] = ids.splice(fromIndex, 1);
  if (toIndex < 0 || toIndex > ids.length) return layout;
  ids.splice(toIndex, 0, removed);
  return next;
}
