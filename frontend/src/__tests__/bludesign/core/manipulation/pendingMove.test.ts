import * as THREE from 'three';
import {
  AssetCategory,
  FLOOR_HEIGHT,
  Orientation,
  type Building,
  type BuildingWall,
  type GridPosition,
  type PlacedObject,
} from '../../../../components/bludesign/core/types';
import {
  buildPendingMoveSnapshots,
  committedGridPositionFromSnapshot,
  keyboardDirectionToGridDelta,
  regularObjectRevertMeshPosition,
  stepWindowMeshAlongWall,
  windowRevertMeshXZ,
} from '../../../../components/bludesign/core/manipulation/pendingMove';

describe('keyboardDirectionToGridDelta', () => {
  it('maps directions to grid deltas', () => {
    expect(keyboardDirectionToGridDelta('up')).toEqual({ deltaX: 0, deltaZ: -1 });
    expect(keyboardDirectionToGridDelta('down')).toEqual({ deltaX: 0, deltaZ: 1 });
    expect(keyboardDirectionToGridDelta('left')).toEqual({ deltaX: -1, deltaZ: 0 });
    expect(keyboardDirectionToGridDelta('right')).toEqual({ deltaX: 1, deltaZ: 0 });
  });
});

describe('committedGridPositionFromSnapshot', () => {
  const base: GridPosition = { x: 2, z: 3, y: 0 };

  it('applies delta on top of snapshot', () => {
    expect(
      committedGridPositionFromSnapshot(
        { position: { x: 1, z: 1, y: 0 }, orientation: Orientation.NORTH },
        base,
        { x: 2, z: -1 }
      )
    ).toEqual({ x: 3, z: 0, y: 0 });
  });

  it('falls back when snapshot is missing', () => {
    expect(committedGridPositionFromSnapshot(undefined, base, { x: 1, z: 0 })).toEqual({
      x: 3,
      z: 3,
      y: 0,
    });
  });
});

describe('stepWindowMeshAlongWall', () => {
  it('projects grid delta onto wall and clamps with margin', () => {
    const gridSize = 1;
    const runtime = {
      wallStart: new THREE.Vector3(0, 0, 0),
      wallDirection: new THREE.Vector3(1, 0, 0),
      wallLength: 10,
    };
    const stepped = stepWindowMeshAlongWall(0, 0, 1, 0, gridSize, runtime);
    expect(stepped.meshX).toBeGreaterThan(0);
    expect(stepped.meshZ).toBe(0);
    expect(stepped.currentWallPosition).toBeGreaterThan(0);
    expect(stepped.currentWallPosition).toBeLessThanOrEqual(1);
  });
});

function po(overrides: Partial<PlacedObject> & { id: string }): PlacedObject {
  return {
    assetId: 'a',
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: {} as PlacedObject['assetMetadata'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('buildPendingMoveSnapshots', () => {

  it('captures building footprints when moving a building', () => {
    const building: Building = {
      id: 'b1',
      name: 'B',
      footprints: [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }],
      floors: [],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const s = buildPendingMoveSnapshots([], 'b1', {
      getBuildingById: () => building,
      getObjectData: () => undefined,
      getWall: () => undefined,
      gridToWorld: (p) => new THREE.Vector3(p.x, 0, p.z),
    });
    expect(s.isBuildingMove).toBe(true);
    expect(s.buildingId).toBe('b1');
    expect(s.buildingOriginalFootprints).toEqual([{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }]);
    expect(s.originalPositions.size).toBe(0);
  });

  it('skips floor tiles and walls in id list', () => {
    const s = buildPendingMoveSnapshots(['floor-tile-1', 'wall-99'], undefined, {
      getBuildingById: () => undefined,
      getObjectData: () => undefined,
      getWall: () => undefined,
      gridToWorld: (p) => new THREE.Vector3(p.x, 0, p.z),
    });
    expect(s.originalPositions.size).toBe(0);
  });

  it('records window wall drag data when wall geometry exists', () => {
    const wall: BuildingWall = {
      id: 'w1',
      buildingId: 'b1',
      startPos: { x: 0, z: 0, y: 0 },
      endPos: { x: 4, z: 0, y: 0 },
      floorLevel: 0,
      isExterior: true,
      openings: [],
    };
    const win = po({
      id: 'win1',
      assetMetadata: { category: AssetCategory.WINDOW } as PlacedObject['assetMetadata'],
      wallAttachment: { wallId: 'w1', position: 0.25 },
    });

    const s = buildPendingMoveSnapshots(['win1'], undefined, {
      getBuildingById: () => undefined,
      getObjectData: (id) => (id === 'win1' ? win : undefined),
      getWall: (id) => (id === 'w1' ? wall : undefined),
      gridToWorld: (p) => new THREE.Vector3(p.x, 0, p.z),
    });

    const wd = s.windowDragData.get('win1');
    expect(wd).toBeDefined();
    expect(wd!.originalWallPosition).toBe(0.25);
    expect(wd!.wallLength).toBe(4);
  });
});

describe('revert mesh helpers', () => {
  it('windowRevertMeshXZ places mesh on wall at original param', () => {
    const xz = windowRevertMeshXZ({
      originalWallPosition: 0.5,
      wallStart: new THREE.Vector3(0, 0, 0),
      wallDirection: new THREE.Vector3(1, 0, 0),
      wallLength: 10,
    });
    expect(xz.x).toBeCloseTo(5);
    expect(xz.z).toBeCloseTo(0);
  });

  it('regularObjectRevertMeshPosition matches grid-to-world centering', () => {
    const asset = {
      gridUnits: { x: 2, z: 1 },
    } as PlacedObject['assetMetadata'];
    const obj = po({
      id: 'o1',
      assetMetadata: asset,
      floor: 1,
    });
    const pos = regularObjectRevertMeshPosition({
      original: { position: { x: 1, z: 2, y: 0 }, orientation: Orientation.NORTH },
      obj,
      asset: obj.assetMetadata,
      gridSize: 1,
      internalYOffset: 0.1,
      gridToWorld: (p) => new THREE.Vector3(p.x * 10, 0, p.z * 10),
    });
    expect(pos.x).toBe(10 + 1);
    expect(pos.z).toBe(20 + 0.5);
    expect(pos.y).toBeCloseTo(1 * FLOOR_HEIGHT * 1 + 0.1);
  });
});
