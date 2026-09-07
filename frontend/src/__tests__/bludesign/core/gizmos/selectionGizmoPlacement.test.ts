import * as THREE from 'three';
import {
  computeSelectionCenterWorld,
  computeSelectionGridCenter,
  rotationForGizmoIndicator,
} from '../../../../components/bludesign/core/gizmos/selectionGizmoPlacement';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, Building, PlacedObject } from '../../../../components/bludesign/core/types';

function asset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return {
    id: 'a',
    name: 'A',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 2, z: 3 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    ...overrides,
  } as AssetMetadata;
}

function placed(id: string, overrides: Partial<PlacedObject> = {}): PlacedObject {
  const meta = asset();
  return {
    id,
    assetId: meta.id,
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: meta,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('computeSelectionGridCenter', () => {
  it('uses building footprint union when building is selected', () => {
    const b: Building = {
      id: 'b1',
      name: 'B',
      footprints: [
        { minX: 0, maxX: 1, minZ: 0, maxZ: 0 },
        { minX: 4, maxX: 5, minZ: 0, maxZ: 0 },
      ],
      floors: [],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const r = computeSelectionGridCenter({
      selectedIds: ['wall-1'],
      selectedBuildingId: 'b1',
      getAllBuildings: () => [b],
      getObjectData: () => undefined,
      scene: new THREE.Scene(),
    });
    expect(r).toEqual({ x: 2.5, z: 0 });
  });

  it('uses object grid AABBs', () => {
    const r = computeSelectionGridCenter({
      selectedIds: ['o1'],
      selectedBuildingId: undefined,
      getAllBuildings: () => [],
      getObjectData: (id) =>
        id === 'o1'
          ? placed('o1', {
              position: { x: 1, z: 2, y: 0 },
              assetMetadata: asset({ gridUnits: { x: 2, z: 2 } }),
            })
          : undefined,
      scene: new THREE.Scene(),
    });
    expect(r).toEqual({ x: 2, z: 3 });
  });

  it('finds floor tile mesh by userData.id', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh();
    mesh.userData.id = 'floor-tile-x';
    mesh.userData.gridX = 3;
    mesh.userData.gridZ = 7;
    scene.add(mesh);

    const r = computeSelectionGridCenter({
      selectedIds: ['floor-tile-x'],
      selectedBuildingId: undefined,
      getAllBuildings: () => [],
      getObjectData: () => undefined,
      scene,
    });
    expect(r).toEqual({ x: 3, z: 7 });
  });
});

describe('computeSelectionCenterWorld', () => {
  it('returns null when no meshes', () => {
    expect(
      computeSelectionCenterWorld({
        selectedIds: ['x'],
        sceneManager: { getObject: () => undefined, getObjectData: () => undefined },
      })
    ).toBeNull();
  });

  it('averages logical centers for grid-placed objects', () => {
    const mesh = new THREE.Object3D();
    mesh.position.set(10, 2, 20);
    mesh.userData.internalXOffset = 1;
    mesh.userData.internalZOffset = 0;

    const po = placed('o1', { exactMeshPos: undefined });
    const r = computeSelectionCenterWorld({
      selectedIds: ['o1'],
      sceneManager: {
        getObject: () => mesh,
        getObjectData: () => po,
      },
    });
    expect(r).not.toBeNull();
    expect(r!.x).toBe(9);
    expect(r!.z).toBe(20);
  });
});

describe('rotationForGizmoIndicator', () => {
  it('uses explicit rotation when set', () => {
    expect(rotationForGizmoIndicator(placed('o', { rotation: 0.5 }))).toBe(0.5);
  });

  it('falls back to orientation', () => {
    expect(rotationForGizmoIndicator(placed('o', { orientation: Orientation.EAST }))).toBeGreaterThan(0);
  });
});
