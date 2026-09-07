/**
 * Tests for facility JSON serialization helpers (save format v2).
 */

import {
  serializePlacedObjectForFacility,
  serializeBuildingForFacility,
  buildActiveSkinsRecordFromPlacedObjects,
  validateFacilityImportData,
  parseFacilityDataJson,
  estimateFacilityDataSizeBytes,
} from '../../../../components/bludesign/core/serialization/facilitySerialization';
import {
  Orientation,
  PlacedObject,
  Building,
  FacilityData,
  GridSize,
  CameraMode,
  IsometricAngle,
} from '../../../../components/bludesign/core/types';
import * as THREE from 'three';
import { AssetCategory, DeviceState } from '../../../../components/bludesign/core/types';

const minimalMetadata = {
  id: 'a1',
  name: 'Unit',
  category: AssetCategory.STORAGE_UNIT,
  gridUnits: { x: 1, z: 1 },
  dimensions: { width: 1, height: 1, depth: 1 },
  isSmart: false,
  canRotate: true,
  canStack: false,
};

describe('facilitySerialization', () => {
  it('serializePlacedObjectForFacility preserves optional fields', () => {
    const obj: PlacedObject = {
      id: 'o1',
      assetId: 'locker-1',
      assetMetadata: minimalMetadata as PlacedObject['assetMetadata'],
      position: { x: 3, z: -2, y: 0 },
      orientation: Orientation.EAST,
      rotation: 0.25,
      exactMeshPos: { x: 1.1, z: 2.2 },
      floor: 2,
      buildingId: 'b1',
      name: 'A1',
      wallAttachment: { wallId: 'w1', position: 0.5 },
      binding: { entityType: 'unit', entityId: 'e1', currentState: DeviceState.UNKNOWN },
      skinId: 'skin-x',
      properties: { k: 1 },
      canStack: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const s = serializePlacedObjectForFacility(obj);
    expect(s.id).toBe('o1');
    expect(s.assetId).toBe('locker-1');
    expect(s.position).toEqual({ x: 3, z: -2 });
    expect(s.orientation).toBe(Orientation.EAST);
    expect(s.rotation).toBe(0.25);
    expect(s.exactMeshPos).toEqual({ x: 1.1, z: 2.2 });
    expect(s.floor).toBe(2);
    expect(s.buildingId).toBe('b1');
    expect(s.name).toBe('A1');
    expect(s.wallAttachment).toEqual({ wallId: 'w1', position: 0.5 });
    expect(s.binding).toEqual({ entityType: 'unit', entityId: 'e1' });
    expect(s.skinId).toBe('skin-x');
    expect(s.properties).toEqual({ k: 1 });
  });

  it('serializePlacedObjectForFacility omits default floor 0', () => {
    const obj: PlacedObject = {
      id: 'o1',
      assetId: 'x',
      assetMetadata: minimalMetadata as PlacedObject['assetMetadata'],
      position: { x: 0, z: 0, y: 0 },
      orientation: Orientation.NORTH,
      canStack: false,
      floor: 0,
      properties: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const s = serializePlacedObjectForFacility(obj);
    expect(s.floor).toBeUndefined();
  });

  it('serializeBuildingForFacility copies footprints and floors', () => {
    const b: Building = {
      id: 'bid',
      name: 'Main',
      footprints: [{ minX: 0, maxX: 2, minZ: 0, maxZ: 1 }],
      floors: [{ level: 0, height: 3, groundTileIds: [] }],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const s = serializeBuildingForFacility(b);
    expect(s.id).toBe('bid');
    expect(s.footprints).toEqual([{ minX: 0, maxX: 2, minZ: 0, maxZ: 1 }]);
    expect(s.floors).toEqual([{ level: 0, height: 3 }]);
  });

  it('buildActiveSkinsRecordFromPlacedObjects maps assetId to skinId', () => {
    const objects: PlacedObject[] = [
      {
        id: '1',
        assetId: 'asset-a',
        assetMetadata: minimalMetadata as PlacedObject['assetMetadata'],
        position: { x: 0, z: 0, y: 0 },
        orientation: Orientation.NORTH,
        canStack: false,
        floor: 0,
        properties: {},
        skinId: 's1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        assetId: 'asset-b',
        assetMetadata: minimalMetadata as PlacedObject['assetMetadata'],
        position: { x: 1, z: 0, y: 0 },
        orientation: Orientation.NORTH,
        canStack: false,
        floor: 0,
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    expect(buildActiveSkinsRecordFromPlacedObjects(objects)).toEqual({ 'asset-a': 's1' });
  });

  it('validateFacilityImportData rejects non-objects', () => {
    expect(validateFacilityImportData(null).valid).toBe(false);
    expect(validateFacilityImportData('x').errors.length).toBeGreaterThan(0);
  });

  it('validateFacilityImportData accepts minimal valid facility', () => {
    const data = {
      name: 't',
      version: '2.0.0',
      camera: {
        mode: CameraMode.FREE,
        isometricAngle: IsometricAngle.SOUTH_WEST,
        position: new THREE.Vector3(0, 0, 0),
        target: new THREE.Vector3(0, 0, 0),
        zoom: 1,
      },
      placedObjects: [
        {
          id: 'o1',
          assetId: 'a',
          position: { x: 0, z: 0 },
          orientation: Orientation.NORTH,
        },
      ],
      buildings: [],
      activeFloor: 0,
      activeSkins: {},
      gridSize: GridSize.TINY,
      showGrid: true,
    };
    expect(validateFacilityImportData(data).valid).toBe(true);
  });

  it('parseFacilityDataJson returns FacilityData when valid', () => {
    const data: FacilityData = {
      name: 't',
      version: '2.0.0',
      camera: {
        mode: CameraMode.FREE,
        isometricAngle: IsometricAngle.SOUTH_WEST,
        position: new THREE.Vector3(0, 0, 0),
        target: new THREE.Vector3(0, 0, 0),
        zoom: 1,
      },
      placedObjects: [],
      buildings: [],
      activeFloor: 0,
      activeSkins: {},
      gridSize: GridSize.TINY,
      showGrid: true,
    };
    const parsed = parseFacilityDataJson(JSON.stringify(data));
    expect(parsed?.name).toBe('t');
  });

  it('estimateFacilityDataSizeBytes is stable', () => {
    const data: FacilityData = {
      name: 't',
      version: '2.0.0',
      camera: {
        mode: CameraMode.FREE,
        isometricAngle: IsometricAngle.SOUTH_WEST,
        position: new THREE.Vector3(0, 0, 0),
        target: new THREE.Vector3(0, 0, 0),
        zoom: 1,
      },
      placedObjects: [],
      buildings: [],
      activeFloor: 0,
      activeSkins: {},
      gridSize: GridSize.TINY,
      showGrid: true,
    };
    expect(estimateFacilityDataSizeBytes(data)).toBe(JSON.stringify(data).length);
  });
});
