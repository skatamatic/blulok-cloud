import * as THREE from 'three';
import {
  AssetCategory,
  Orientation,
  type PlacedObject,
} from '../../../../components/bludesign/core/types';
import { applySelectionRotationByAngle } from '../../../../components/bludesign/core/placement/applySelectionRotationByAngle';
import type { MeshRotateEntry } from '../../../../components/bludesign/core/placement/collectMeshesForSelectionRotation';

function asset(): PlacedObject['assetMetadata'] {
  return {
    id: 'a',
    name: 'a',
    category: AssetCategory.DECORATION,
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  };
}

function entry(
  id: string,
  mesh: THREE.Object3D,
  overrides: Partial<PlacedObject> = {}
): MeshRotateEntry {
  const placedObject: PlacedObject = {
    id,
    assetId: 'a',
    assetMetadata: asset(),
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  return { mesh, placedObject, asset: placedObject.assetMetadata };
}

describe('applySelectionRotationByAngle', () => {
  it('single selection rotates mesh and snaps orientation', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Object3D();
    scene.add(mesh);
    const e = entry('a', mesh);
    const grid = {
      clearOccupied: jest.fn(),
      worldToGrid: jest.fn(),
      getFootprintCenterWorld: jest.fn(() => new THREE.Vector3(0, 0, 0)),
      markOccupied: jest.fn(),
    };
    const syncGizmo = jest.fn();

    applySelectionRotationByAngle(Math.PI / 2, ['a'], [e], {
      scene,
      grid,
      syncRotateGizmoFromSelectionCenter: syncGizmo,
    });

    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(e.placedObject.orientation).toBe(Orientation.EAST);
    expect(syncGizmo).not.toHaveBeenCalled();
  });

  it('multi selection runs pivot path and syncs gizmo', () => {
    const scene = new THREE.Scene();
    const m1 = new THREE.Object3D();
    m1.position.set(0, 0, 0);
    const m2 = new THREE.Object3D();
    m2.position.set(2, 0, 0);
    scene.add(m1);
    scene.add(m2);

    const e1 = entry('a', m1, { position: { x: 0, z: 0, y: 0 } });
    const e2 = entry('b', m2, { position: { x: 2, z: 0, y: 0 } });

    const grid = {
      clearOccupied: jest.fn(),
      worldToGrid: jest.fn(() => ({ x: 0, z: 0, y: 0 })),
      getFootprintCenterWorld: jest.fn(() => new THREE.Vector3(0, 0, 0)),
      markOccupied: jest.fn(() => null),
    };
    const syncGizmo = jest.fn();

    applySelectionRotationByAngle(0.1, ['a', 'b'], [e1, e2], {
      scene,
      grid,
      syncRotateGizmoFromSelectionCenter: syncGizmo,
    });

    expect(syncGizmo).toHaveBeenCalledTimes(1);
    expect(grid.clearOccupied).toHaveBeenCalled();
    expect(grid.markOccupied).toHaveBeenCalled();
  });
});
