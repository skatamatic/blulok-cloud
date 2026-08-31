/**
 * Interactive move validation — occupancy, ground-on-building, wall crossing, upper-floor building envelope.
 */

import * as THREE from 'three';
import {
  collectBuildingWallMeshesFromScene,
  validatePlacedObjectMove,
  wouldCrossBuildingWallForMove,
} from '../../../../components/bludesign/core/manipulation/selectionMoveValidation';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { AssetMetadata, PlacedObject } from '../../../../components/bludesign/core/types';

function asset(overrides: Partial<AssetMetadata> = {}): AssetMetadata {
  return {
    id: 'a1',
    name: 'A',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 2, z: 2 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    ...overrides,
  } as AssetMetadata;
}

function placed(overrides: Partial<PlacedObject> & { id: string }): PlacedObject {
  const meta = asset();
  const { id, ...rest } = overrides;
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
    ...rest,
  };
}

describe('collectBuildingWallMeshesFromScene', () => {
  it('collects meshes with isBuildingWall and matching or undefined floor', () => {
    const scene = new THREE.Scene();
    const w0 = new THREE.Mesh();
    w0.userData.isBuildingWall = true;
    w0.userData.floor = 1;
    const w1 = new THREE.Mesh();
    w1.userData.isBuildingWall = true;
    w1.userData.floor = undefined;
    const skip = new THREE.Mesh();
    skip.userData.isBuildingWall = true;
    skip.userData.floor = 2;
    scene.add(w0, w1, skip);

    const forFloor1 = collectBuildingWallMeshesFromScene(scene, 1);
    expect(forFloor1).toEqual(expect.arrayContaining([w0, w1]));
    expect(forFloor1).toHaveLength(2);
  });
});

describe('wouldCrossBuildingWallForMove', () => {
  const gridSize = 1;

  it('returns false when there are no walls', () => {
    expect(
      wouldCrossBuildingWallForMove({
        gridPos: { x: 0, z: 0, y: 0 },
        size: { x: 2, z: 2 },
        gridSize,
        wallMeshes: [],
      })
    ).toBe(false);
  });

  it('detects north-south wall crossing through object interior', () => {
    const wall = new THREE.Mesh();
    wall.userData.wallOrientation = 'north-south';
    wall.position.set(1.5, 0, 1);

    expect(
      wouldCrossBuildingWallForMove({
        gridPos: { x: 0, z: 0, y: 0 },
        size: { x: 4, z: 4 },
        gridSize,
        wallMeshes: [wall],
      })
    ).toBe(true);
  });

  it('detects east-west wall crossing through object interior', () => {
    const wall = new THREE.Mesh();
    wall.userData.wallOrientation = 'east-west';
    wall.position.set(1, 0, 1.5);

    expect(
      wouldCrossBuildingWallForMove({
        gridPos: { x: 0, z: 0, y: 0 },
        size: { x: 4, z: 4 },
        gridSize,
        wallMeshes: [wall],
      })
    ).toBe(true);
  });

  it('ignores non-mesh wall entries', () => {
    const group = new THREE.Group();
    group.userData.isBuildingWall = true;
    group.userData.wallOrientation = 'north-south';

    expect(
      wouldCrossBuildingWallForMove({
        gridPos: { x: 0, z: 0, y: 0 },
        size: { x: 4, z: 4 },
        gridSize,
        wallMeshes: [group],
      })
    ).toBe(false);
  });
});

describe('validatePlacedObjectMove', () => {
  function ports(overrides: {
    occupied?: boolean;
    buildingAtCell?: (x: number, z: number) => string | null;
    scene?: THREE.Object3D;
  }) {
    const isOccupiedExcluding = jest.fn(() => overrides.occupied ?? false);
    const getGridSize = jest.fn(() => 1);
    const getBuildingAtCell = jest.fn(
      (x: number, z: number) => overrides.buildingAtCell?.(x, z) ?? null
    );
    return {
      gridSystem: { isOccupiedExcluding, getGridSize },
      buildingManager: { getBuildingAtCell },
      sceneRoot: overrides.scene ?? new THREE.Scene(),
    };
  }

  it('returns false without asset metadata', () => {
    const obj = { ...placed({ id: 'x' }), assetMetadata: undefined } as unknown as PlacedObject;
    expect(validatePlacedObjectMove(obj, { x: 0, z: 0, y: 0 }, new Set(), ports({}))).toBe(false);
  });

  it('returns false when grid reports occupied', () => {
    const obj = placed({ id: 'o1' });
    const p = ports({ occupied: true });
    expect(
      validatePlacedObjectMove(obj, { x: 1, z: 1, y: 0 }, new Set(['o1']), p)
    ).toBe(false);
    expect(p.gridSystem.isOccupiedExcluding).toHaveBeenCalled();
  });

  it('blocks ground material when any cell overlaps a building', () => {
    const obj = placed({
      id: 'g1',
      assetMetadata: asset({ category: AssetCategory.GRASS, gridUnits: { x: 1, z: 1 } }),
    });
    const p = ports({
      buildingAtCell: (x, z) => (x === 2 && z === 3 ? 'bid' : null),
    });
    expect(
      validatePlacedObjectMove(obj, { x: 2, z: 3, y: 0 }, new Set(), p)
    ).toBe(false);
  });

  it('requires all footprint cells inside a building on upper floors for normal categories', () => {
    const obj = placed({
      id: 'u1',
      floor: 1,
      assetMetadata: asset({ category: AssetCategory.STORAGE_UNIT, gridUnits: { x: 2, z: 1 } }),
    });
    const ok = ports({
      buildingAtCell: (x, z) => (x <= 1 && z === 0 ? 'b1' : null),
    });
    expect(
      validatePlacedObjectMove(obj, { x: 0, z: 0, y: 0 }, new Set(), ok)
    ).toBe(true);

    const bad = ports({
      buildingAtCell: (x, z) => (x === 0 && z === 0 ? 'b1' : null),
    });
    expect(
      validatePlacedObjectMove(obj, { x: 0, z: 0, y: 0 }, new Set(), bad)
    ).toBe(false);
  });

  it('allows WINDOW on upper floor without full-building cell coverage', () => {
    const obj = placed({
      id: 'w1',
      floor: 2,
      assetMetadata: asset({ category: AssetCategory.WINDOW, gridUnits: { x: 1, z: 1 } }),
    });
    const p = ports({ buildingAtCell: () => null });
    expect(validatePlacedObjectMove(obj, { x: 5, z: 5, y: 0 }, new Set(), p)).toBe(true);
  });

  it('skips wall crossing for pavement', () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh();
    wall.userData.isBuildingWall = true;
    wall.userData.floor = 0;
    wall.userData.wallOrientation = 'north-south';
    wall.position.set(0.5, 0, 0.5);
    scene.add(wall);

    const obj = placed({
      id: 'p1',
      assetMetadata: asset({ category: AssetCategory.PAVEMENT, gridUnits: { x: 2, z: 2 } }),
    });
    const p = ports({ scene });
    expect(validatePlacedObjectMove(obj, { x: 0, z: 0, y: 0 }, new Set(), p)).toBe(true);
  });

  it('fails wall crossing when wall blocks interior for storage unit', () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh();
    wall.userData.isBuildingWall = true;
    wall.userData.floor = 0;
    wall.userData.wallOrientation = 'north-south';
    wall.position.set(1.5, 0, 1);
    scene.add(wall);

    const obj = placed({
      id: 's1',
      assetMetadata: asset({ category: AssetCategory.STORAGE_UNIT, gridUnits: { x: 4, z: 4 } }),
    });
    const p = ports({ scene });
    expect(validatePlacedObjectMove(obj, { x: 0, z: 0, y: 0 }, new Set(), p)).toBe(false);
  });
});
