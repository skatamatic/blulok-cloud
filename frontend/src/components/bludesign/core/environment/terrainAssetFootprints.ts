/**
 * Selectable facility asset footprints for viewer terrain conform modes.
 */

import * as THREE from 'three';

const SKIP_USER_DATA_KEYS = new Set([
  'isViewerGroundPlane',
  'isGroundPlane',
  'isGrid',
  'isScenery',
  'isTechnoGrid',
  'isGizmo',
]);

export type AssetFootprintXZ = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
};

const _box = new THREE.Box3();

export function isTerrainAlignableNode(node: THREE.Object3D): boolean {
  if (node.userData.isViewerGroundPlane) return false;
  for (const key of SKIP_USER_DATA_KEYS) {
    if (node.userData[key]) return false;
  }
  if (!node.userData.selectable) return false;
  return Boolean(node.userData.id || node.userData.buildingId);
}

export function collectTerrainAlignableFootprints(scene: THREE.Scene): AssetFootprintXZ[] {
  const footprints: AssetFootprintXZ[] = [];

  scene.traverse((node) => {
    if (!isTerrainAlignableNode(node)) return;
    _box.setFromObject(node);
    if (!_box.isEmpty()) {
      footprints.push({
        minX: _box.min.x,
        minZ: _box.min.z,
        maxX: _box.max.x,
        maxZ: _box.max.z,
      });
    }
  });

  return footprints;
}
