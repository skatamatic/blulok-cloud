import * as THREE from 'three';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import { regularObjectRevertMeshPosition } from '../../../../components/bludesign/core/manipulation/pendingMove/revertMeshPositions';

describe('regularObjectRevertMeshPosition', () => {
  const asset = {
    id: 'u',
    name: 'unit',
    category: AssetCategory.STORAGE_UNIT,
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
    gridUnits: { x: 1, z: 1 },
  };

  it('restores exact world XZ when the snapshot has exactMeshPos', () => {
    const pos = regularObjectRevertMeshPosition({
      original: {
        position: { x: 2, z: 3, y: 0 },
        orientation: Orientation.NORTH,
        exactMeshPos: { x: 2.37, z: 5.62 },
      },
      obj: { floor: 0 } as never,
      asset,
      gridSize: 1,
      internalYOffset: 0.05,
      gridToWorld: () => new THREE.Vector3(99, 0, 99),
    });

    expect(pos.x).toBeCloseTo(2.37);
    expect(pos.z).toBeCloseTo(5.62);
    expect(pos.y).toBeCloseTo(0.05);
  });
});
