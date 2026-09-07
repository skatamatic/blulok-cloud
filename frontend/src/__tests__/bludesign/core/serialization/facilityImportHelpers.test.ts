/**
 * Facility import format detection (pure helpers).
 */

import {
  isLegacyFacilityFormat,
  collectUniqueSerializedAssetIds,
} from '../../../../components/bludesign/core/serialization/facilityImportHelpers';
import {
  FacilityData,
  LegacyFacilityData,
  SerializedPlacedObject,
  PlacedObject,
  GridSize,
  CameraMode,
  IsometricAngle,
  Orientation,
  AssetCategory,
} from '../../../../components/bludesign/core/types';
import * as THREE from 'three';

const camera = {
  mode: CameraMode.FREE,
  isometricAngle: IsometricAngle.SOUTH_WEST,
  position: new THREE.Vector3(0, 0, 0),
  target: new THREE.Vector3(0, 0, 0),
  zoom: 1,
};

const baseMeta = {
  id: 'a1',
  name: 'U',
  category: AssetCategory.STORAGE_UNIT,
  gridUnits: { x: 1, z: 1 },
  dimensions: { width: 1, height: 1, depth: 1 },
  isSmart: false,
  canRotate: true,
  canStack: false,
};

function serializedObj(id: string, assetId: string): SerializedPlacedObject {
  return {
    id,
    assetId,
    position: { x: 0, z: 0 },
    orientation: Orientation.NORTH,
    floor: 0,
    properties: {},
  };
}

function legacyPlaced(id: string): PlacedObject {
  return {
    id,
    assetId: 'x',
    assetMetadata: baseMeta as PlacedObject['assetMetadata'],
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function v2Facility(overrides: Partial<FacilityData> = {}): FacilityData {
  return {
    name: 'F',
    version: '2.0.0',
    camera,
    placedObjects: [serializedObj('o1', 'asset-a')],
    buildings: [],
    activeFloor: 0,
    activeSkins: {},
    gridSize: GridSize.TINY,
    showGrid: true,
    ...overrides,
  };
}

describe('isLegacyFacilityFormat', () => {
  it('returns true for version 1.0.0 even with empty placedObjects', () => {
    const data: FacilityData = {
      ...v2Facility(),
      version: '1.0.0',
      placedObjects: [],
    };
    expect(isLegacyFacilityFormat(data)).toBe(true);
  });

  it('returns true when first placed object has assetMetadata (legacy blob)', () => {
    const data: LegacyFacilityData = {
      name: 'L',
      version: '2.0.0',
      camera,
      placedObjects: [legacyPlaced('p1')],
      buildings: [],
      activeFloor: 0,
      gridSize: GridSize.TINY,
      showGrid: true,
    };
    expect(isLegacyFacilityFormat(data)).toBe(true);
  });

  it('returns false for v2 serialized objects without assetMetadata on first row', () => {
    expect(isLegacyFacilityFormat(v2Facility())).toBe(false);
  });

  it('returns false when placedObjects is empty and version is not 1.0.0', () => {
    const data = v2Facility({ placedObjects: [] });
    expect(isLegacyFacilityFormat(data)).toBe(false);
  });
});

describe('collectUniqueSerializedAssetIds', () => {
  it('returns empty for legacy format', () => {
    const legacy: LegacyFacilityData = {
      name: 'L',
      version: '2.0.0',
      camera,
      placedObjects: [legacyPlaced('a')],
      buildings: [],
      activeFloor: 0,
      gridSize: GridSize.TINY,
      showGrid: true,
    };
    expect(collectUniqueSerializedAssetIds(legacy)).toEqual([]);
  });

  it('deduplicates asset ids for optimized format', () => {
    const data = v2Facility({
      placedObjects: [
        serializedObj('1', 'door'),
        serializedObj('2', 'door'),
        serializedObj('3', 'window'),
      ],
    });
    expect(collectUniqueSerializedAssetIds(data).sort()).toEqual(['door', 'window']);
  });

  it('returns empty when no placed objects in v2 data', () => {
    const data = v2Facility({ placedObjects: [] });
    expect(collectUniqueSerializedAssetIds(data)).toEqual([]);
  });
});
