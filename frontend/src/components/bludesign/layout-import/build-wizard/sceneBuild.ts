/**
 * Build-in-3D Wizard — Scene assembly (pure)
 *
 * Assembles a v2 `FacilityData` from reviewed units, the calibrated scale, the
 * per-unit asset ids, and the unit->BluLok bindings. Positions are placed using
 * `exactMeshPos` (world meters) so tilted rows land exactly; `position` is the
 * nearest grid index for occupancy. The full layout is translated so its world
 * bounds are centered on the origin — imported sites no longer land far from (0, 0).
 *
 * Coordinate mapping: pixel x -> world X, pixel y -> world Z (Y-up world). The 2D
 * rotation (y-down image) becomes a world Y rotation of -rotationRad.
 */

import {
  CameraMode,
  GRID_UNIT_METERS,
  GridSize,
  IsometricAngle,
  Orientation,
} from '../../core/types';
import type { FacilityData, SerializedPlacedObject } from '../../core/types';
import type { EditableUnit } from '../types';
import { rectCorners } from '../geometry';
import { buildLayoutImportMetadata } from '../layoutImportMetadata';

export interface SceneBuildInput {
  units: EditableUnit[];
  metersPerPixel: number;
  /** diagram unit id -> asset definition id. Units without an asset are skipped. */
  assetIdByUnitId: Record<string, string>;
  /** diagram unit id -> BluLok unit id to bind (optional). */
  bindingByUnitId: Record<string, string>;
  facility: { id: string; name: string } | null;
  sceneName: string;
  imageWidth: number;
  imageHeight: number;
}

/** Convert a pixel position into world meters using the scale. */
function pxToWorld(px: number, metersPerPixel: number): number {
  return px * metersPerPixel;
}

/**
 * World-space center of the layout's axis-aligned bounds (meters).
 * Uses rotated unit corners so tilted rows center correctly.
 */
export function computeLayoutWorldCenter(
  units: EditableUnit[],
  assetIdByUnitId: Record<string, string>,
  metersPerPixel: number,
): { x: number; z: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let any = false;

  for (const unit of units) {
    if (!assetIdByUnitId[unit.id]) continue;
    any = true;
    for (const corner of rectCorners(unit.bounds, unit.rotationRad)) {
      const x = pxToWorld(corner.x, metersPerPixel);
      const z = pxToWorld(corner.y, metersPerPixel);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  if (!any || !Number.isFinite(minX)) {
    return { x: 0, z: 0 };
  }

  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
  };
}

export function buildFacilityData(input: SceneBuildInput): FacilityData {
  const mpp = input.metersPerPixel;
  const layoutCenter = computeLayoutWorldCenter(input.units, input.assetIdByUnitId, mpp);
  const placedObjects: SerializedPlacedObject[] = [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const unit of input.units) {
    const assetId = input.assetIdByUnitId[unit.id];
    if (!assetId) continue;

    const x = pxToWorld(unit.bounds.cx, mpp) - layoutCenter.x;
    const z = pxToWorld(unit.bounds.cy, mpp) - layoutCenter.z;

    const obj: SerializedPlacedObject = {
      id: unit.id,
      assetId,
      position: {
        x: Math.round(x / GRID_UNIT_METERS),
        z: Math.round(z / GRID_UNIT_METERS),
      },
      orientation: Orientation.NORTH,
      rotation: -unit.rotationRad,
      exactMeshPos: { x, z },
      floor: 0,
    };
    if (unit.label) obj.name = unit.label;
    const bound = input.bindingByUnitId[unit.id];
    if (bound) obj.binding = { entityType: 'unit', entityId: bound };

    placedObjects.push(obj);

    for (const corner of rectCorners(unit.bounds, unit.rotationRad)) {
      const cx = pxToWorld(corner.x, mpp) - layoutCenter.x;
      const cz = pxToWorld(corner.y, mpp) - layoutCenter.z;
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minZ = Math.min(minZ, cz);
      maxZ = Math.max(maxZ, cz);
    }
  }

  const extent =
    Number.isFinite(minX) && Number.isFinite(maxX)
      ? Math.max(maxX - minX, maxZ - minZ, GRID_UNIT_METERS)
      : 20;
  const dist = Math.max(20, extent * 0.9);

  const camera = {
    mode: CameraMode.FREE,
    isometricAngle: IsometricAngle.NORTH_EAST,
    position: { x: dist * 0.6, y: dist * 0.55, z: dist * 0.6 },
    target: { x: 0, y: 0, z: 0 },
    zoom: 1,
  };

  return {
    name: input.sceneName,
    version: '2.0.0',
    camera,
    placedObjects,
    buildings: [],
    activeFloor: 0,
    activeSkins: {},
    gridSize: GridSize.TINY,
    showGrid: true,
    layoutImport: buildLayoutImportMetadata({
      units: input.units,
      assetIdByUnitId: input.assetIdByUnitId,
      metersPerPixel: mpp,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
    }),
    dataSource: input.facility
      ? {
          type: 'blulok',
          facilityId: input.facility.id,
          facilityName: input.facility.name,
          autoConnect: true,
        }
      : undefined,
  };
}
