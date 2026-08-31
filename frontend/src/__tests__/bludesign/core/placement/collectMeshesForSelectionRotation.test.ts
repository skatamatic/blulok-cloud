import * as THREE from 'three';
import {
  AssetCategory,
  Orientation,
  type PlacedObject,
} from '../../../../components/bludesign/core/types';
import { collectMeshesForSelectionRotation } from '../../../../components/bludesign/core/placement/collectMeshesForSelectionRotation';

function minimalPo(id: string): PlacedObject {
  return {
    id,
    assetId: 'a',
    assetMetadata: {
      id: 'a',
      name: 'a',
      category: AssetCategory.DECORATION,
      dimensions: { width: 1, height: 1, depth: 1 },
      isSmart: false,
      canRotate: true,
      canStack: false,
      gridUnits: { x: 1, z: 1 },
    },
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('collectMeshesForSelectionRotation', () => {
  it('skips floor tiles and walls', () => {
    const m = new THREE.Object3D();
    const r = collectMeshesForSelectionRotation(
      ['floor-tile-x', 'wall-1', 'o1'],
      (id) => (id === 'o1' ? minimalPo('o1') : undefined),
      () => m
    );
    expect(r).toHaveLength(1);
    expect(r[0].placedObject.id).toBe('o1');
  });

  it('returns empty when mesh missing', () => {
    expect(
      collectMeshesForSelectionRotation(['o1'], (id) => minimalPo(id), () => undefined)
    ).toEqual([]);
  });
});
