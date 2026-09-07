/**
 * Persisted layout-import metadata on FacilityData.
 *
 * The source plan image is stored separately in facility storage
 * (`layout-source.png`); this struct holds pixel-space unit geometry only.
 */

import {
  AssetCategory,
  DeviceState,
  Orientation,
  type FacilityData,
  type PlacedObject,
  type SerializedPlacedObject,
} from '../core/types';
import type { EditableUnit, RotatedRectPx } from './types';
import { hexToRgba, overlayColor, type OverlayColor } from './colors';

export const LAYOUT_SOURCE_FILENAME = 'layout-source.png';

export interface LayoutImportUnit {
  placedObjectId: string;
  bounds: RotatedRectPx;
  rotationRad: number;
  label?: string;
  kind?: 'unit' | 'rectangle';
}

export interface LayoutImportMetadata {
  version: 1;
  metersPerPixel: number;
  imageWidth: number;
  imageHeight: number;
  importedAt: string;
  sourceImageFile: typeof LAYOUT_SOURCE_FILENAME;
  units: LayoutImportUnit[];
}

export interface BuildLayoutImportInput {
  units: EditableUnit[];
  assetIdByUnitId: Record<string, string>;
  metersPerPixel: number;
  imageWidth: number;
  imageHeight: number;
}

function isValidUnitBounds(bounds: unknown): bounds is RotatedRectPx {
  if (!bounds || typeof bounds !== 'object') return false;
  const b = bounds as RotatedRectPx;
  return (
    Number.isFinite(b.cx) &&
    Number.isFinite(b.cy) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height) &&
    b.width > 0 &&
    b.height > 0
  );
}

/**
 * Repair persisted import metadata (missing filename, invalid units, etc.).
 * Returns null when the payload cannot support a 2D plan view.
 */
export function normalizeLayoutImportMetadata(meta: unknown): LayoutImportMetadata | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta as Partial<LayoutImportMetadata>;
  if (raw.version !== undefined && raw.version !== 1) return null;

  const imageWidth = Number(raw.imageWidth);
  const imageHeight = Number(raw.imageHeight);
  const metersPerPixel = Number(raw.metersPerPixel);
  if (!(imageWidth > 0) || !(imageHeight > 0) || !(metersPerPixel > 0)) {
    return null;
  }

  const units: LayoutImportUnit[] = [];
  if (Array.isArray(raw.units)) {
    for (const unit of raw.units) {
      if (!unit || typeof unit !== 'object') continue;
      const u = unit as Partial<LayoutImportUnit>;
      if (typeof u.placedObjectId !== 'string' || !u.placedObjectId) continue;
      if (!isValidUnitBounds(u.bounds)) continue;
      if (!Number.isFinite(u.rotationRad)) continue;
      units.push({
        placedObjectId: u.placedObjectId,
        bounds: { ...u.bounds! },
        rotationRad: u.rotationRad!,
        label: u.label,
        kind: u.kind,
      });
    }
  }
  if (units.length === 0) return null;

  return {
    version: 1,
    metersPerPixel,
    imageWidth,
    imageHeight,
    importedAt:
      typeof raw.importedAt === 'string' && raw.importedAt
        ? raw.importedAt
        : new Date().toISOString(),
    sourceImageFile: LAYOUT_SOURCE_FILENAME,
    units,
  };
}

/** Read normalized import metadata from facility JSON (null when unavailable). */
export function getLayoutImportFromFacility(
  data: FacilityData | null | undefined
): LayoutImportMetadata | null {
  return normalizeLayoutImportMetadata(data?.layoutImport);
}

export function isValidLayoutImport(meta: unknown): meta is LayoutImportMetadata {
  return normalizeLayoutImportMetadata(meta) !== null;
}

export function hasLayoutImport(data: FacilityData | null | undefined): data is FacilityData & {
  layoutImport: LayoutImportMetadata;
} {
  const normalized = getLayoutImportFromFacility(data);
  if (!normalized || !data) return false;
  data.layoutImport = normalized;
  return true;
}

/** Merge persisted import metadata into a facility save payload. */
export function attachLayoutImportToFacilityData(
  data: FacilityData,
  layoutImport: LayoutImportMetadata | null | undefined
): FacilityData {
  const normalized = layoutImport ? normalizeLayoutImportMetadata(layoutImport) : null;
  if (normalized) {
    return { ...data, layoutImport: normalized };
  }
  return data;
}

export function buildLayoutImportMetadata(input: BuildLayoutImportInput): LayoutImportMetadata {
  const units: LayoutImportUnit[] = [];
  for (const unit of input.units) {
    if (!input.assetIdByUnitId[unit.id]) continue;
    units.push({
      placedObjectId: unit.id,
      bounds: { ...unit.bounds },
      rotationRad: unit.rotationRad,
      label: unit.label,
      kind: unit.kind,
    });
  }
  const meta: LayoutImportMetadata = {
    version: 1,
    metersPerPixel: input.metersPerPixel,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    importedAt: new Date().toISOString(),
    sourceImageFile: LAYOUT_SOURCE_FILENAME,
    units,
  };
  if (!isValidLayoutImport(meta)) {
    throw new Error('Layout import metadata is invalid — no units were mapped to assets.');
  }
  return meta;
}

export function layoutImportToEditableUnits(meta: LayoutImportMetadata): EditableUnit[] {
  return meta.units.map((u) => ({
    id: u.placedObjectId,
    kind: u.kind ?? 'unit',
    bounds: { ...u.bounds },
    rotationRad: u.rotationRad,
    label: u.label,
    labelConfidence: 1,
    detectionConfidence: 1,
  }));
}

/** Minimal PlacedObject stubs for the viewer smart-search panel. */
export function buildViewerPlacedObjects(
  placedObjects: SerializedPlacedObject[],
  layoutImport: LayoutImportMetadata
): PlacedObject[] {
  const labelById = new Map(layoutImport.units.map((u) => [u.placedObjectId, u.label]));
  const stubMeta = {
    id: 'import-stub',
    name: 'Storage unit',
    category: AssetCategory.STORAGE_UNIT,
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: true,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  };

  return placedObjects.map((po) => ({
    id: po.id,
    assetId: po.assetId,
    assetMetadata: { ...stubMeta, id: po.assetId, name: po.name ?? labelById.get(po.id) ?? 'Storage unit' },
    position: po.position ?? { x: 0, z: 0 },
    orientation: po.orientation ?? Orientation.NORTH,
    rotation: po.rotation,
    exactMeshPos: po.exactMeshPos,
    canStack: false,
    name: po.name ?? labelById.get(po.id),
    floor: po.floor ?? 0,
    properties: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    binding: po.binding
      ? {
          entityType: po.binding.entityType as 'unit',
          entityId: po.binding.entityId,
          currentState: DeviceState.UNKNOWN,
        }
      : undefined,
  }));
}

/** Shared live-state colors for 2D overlays and legends. */
export const LIVE_STATE_COLORS = {
  locked: '#22c55e',
  unlocked: '#eab308',
  error: '#ef4444',
  maintenance: '#f97316',
  offline: '#6b7280',
  unknown: '#94a3b8',
  unbound: '#cbd5e1',
} as const;

export const LIVE_STATE_LEGEND = [
  { key: 'locked', label: 'Locked', color: LIVE_STATE_COLORS.locked },
  { key: 'unlocked', label: 'Unlocked', color: LIVE_STATE_COLORS.unlocked },
  { key: 'maintenance', label: 'Maintenance', color: LIVE_STATE_COLORS.maintenance },
  { key: 'error', label: 'Error', color: LIVE_STATE_COLORS.error },
  { key: 'offline', label: 'Offline', color: LIVE_STATE_COLORS.offline },
  { key: 'unknown', label: 'No signal', color: LIVE_STATE_COLORS.unknown },
] as const;

const SELECT_BLUE = '#147FD4';

export type LiveUnitTelemetry = 'live' | 'pending' | 'unbound' | 'no-signal';

export function resolveLiveUnitColor(
  state?: DeviceState,
  lockStatus?: string,
  fillOpacity = 0.55,
  telemetry: LiveUnitTelemetry = 'live',
): OverlayColor {
  if (telemetry === 'unbound') {
    return {
      stroke: LIVE_STATE_COLORS.unbound,
      fill: hexToRgba(LIVE_STATE_COLORS.unbound, fillOpacity * 0.35),
    };
  }
  if (telemetry === 'pending' || telemetry === 'no-signal') {
    return {
      stroke: LIVE_STATE_COLORS.unknown,
      fill: hexToRgba(LIVE_STATE_COLORS.unknown, fillOpacity * 0.4),
    };
  }

  if (state === DeviceState.OFFLINE) {
    return {
      stroke: LIVE_STATE_COLORS.offline,
      fill: hexToRgba(LIVE_STATE_COLORS.offline, fillOpacity),
    };
  }
  if (state === DeviceState.MAINTENANCE || lockStatus === 'maintenance') {
    return {
      stroke: LIVE_STATE_COLORS.maintenance,
      fill: hexToRgba(LIVE_STATE_COLORS.maintenance, fillOpacity),
    };
  }
  if (state === DeviceState.ERROR || lockStatus === 'error') {
    return {
      stroke: LIVE_STATE_COLORS.error,
      fill: hexToRgba(LIVE_STATE_COLORS.error, fillOpacity),
    };
  }
  const isUnlocked =
    state === DeviceState.UNLOCKED || lockStatus === 'unlocked';
  if (isUnlocked) {
    return {
      stroke: LIVE_STATE_COLORS.unlocked,
      fill: hexToRgba(LIVE_STATE_COLORS.unlocked, fillOpacity),
    };
  }
  return {
    stroke: LIVE_STATE_COLORS.locked,
    fill: hexToRgba(LIVE_STATE_COLORS.locked, fillOpacity),
  };
}

/** Remove import-plan metadata when explicitly starting fresh (e.g. new facility). */
export function stripLayoutImportFromFacilityData(data: FacilityData): FacilityData {
  const { layoutImport: _removed, ...rest } = data;
  return rest;
}

export function selectionStrokeColor(): string {
  return SELECT_BLUE;
}

/** Editor import-plan overlay: bound units use brand blue; unbound are dimmed. */
export function editorImportPlanUnitColor(isDataBound: boolean): OverlayColor {
  if (!isDataBound) {
    return resolveLiveUnitColor(undefined, undefined, 0.55, 'unbound');
  }
  return overlayColor(false, 0.55);
}
