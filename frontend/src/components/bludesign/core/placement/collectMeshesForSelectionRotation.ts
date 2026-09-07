import * as THREE from 'three';
import type { AssetMetadata, PlacedObject } from '../types';

export type MeshRotateEntry = {
  mesh: THREE.Object3D;
  placedObject: PlacedObject;
  asset: AssetMetadata | null;
};

/**
 * Resolves selected ids to scene meshes + data, skipping building chrome ids.
 */
export function collectMeshesForSelectionRotation(
  selectedIds: readonly string[],
  getObjectData: (id: string) => PlacedObject | undefined,
  getObject: (id: string) => THREE.Object3D | undefined
): MeshRotateEntry[] {
  const meshesToRotate: MeshRotateEntry[] = [];

  for (const id of selectedIds) {
    if (id.startsWith('floor-tile-') || id.startsWith('wall-')) continue;

    const placedObject = getObjectData(id);
    const mesh = getObject(id);

    if (placedObject && mesh) {
      meshesToRotate.push({
        mesh,
        placedObject,
        asset: placedObject.assetMetadata,
      });
    }
  }

  return meshesToRotate;
}
