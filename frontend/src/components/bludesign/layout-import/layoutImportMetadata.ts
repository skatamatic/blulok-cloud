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
import { hexToRgba, type OverlayColor } from './colors';

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

export function isValidLayoutImport(meta: unknown): meta is LayoutImportMetadata {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as LayoutImportMetadata;
  return (
    m.version === 1 &&
    m.imageWidth > 0 &&
    m.imageHeight > 0 &&
    m.metersPerPixel > 0 &&
    m.sourceImageFile === LAYOUT_SOURCE_FILENAME &&
    Array.isArray(m.units) &&
    m.units.length > 0
  );
}

export function hasLayoutImport(data: FacilityData | null | undefined): data is FacilityData & {
  layoutImport: LayoutImportMetadata;
} {
  return isValidLayoutImport(data?.layoutImport);
}

/** Merge persisted import metadata into a facility save payload. */
export function attachLayoutImportToFacilityData(
  data: FacilityData,
  layoutImport: LayoutImportMetadata | null | undefined
): FacilityData {
  if (layoutImport && isValidLayoutImport(layoutImport)) {
    return { ...data, layoutImport };
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
  return {
    version: 1,
    metersPerPixel: input.metersPerPixel,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    importedAt: new Date().toISOString(),
    sourceImageFile: LAYOUT_SOURCE_FILENAME,
    units,
  };
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

const LIVE_GREEN = '#22c55e';
const LIVE_YELLOW = '#eab308';
const LIVE_RED = '#ef4444';
const SELECT_BLUE = '#147FD4';

export function resolveLiveUnitColor(
  state?: DeviceState,
  lockStatus?: string,
  fillOpacity = 0.55
): OverlayColor {
  const isError =
    state === DeviceState.ERROR ||
    lockStatus === 'error' ||
    state === DeviceState.MAINTENANCE;
  if (isError) {
    return { stroke: LIVE_RED, fill: hexToRgba(LIVE_RED, fillOpacity) };
  }
  const isUnlocked =
    state === DeviceState.UNLOCKED || lockStatus === 'unlocked';
  if (isUnlocked) {
    return { stroke: LIVE_YELLOW, fill: hexToRgba(LIVE_YELLOW, fillOpacity) };
  }
  return { stroke: LIVE_GREEN, fill: hexToRgba(LIVE_GREEN, fillOpacity) };
}

export function selectionStrokeColor(): string {
  return SELECT_BLUE;
}
