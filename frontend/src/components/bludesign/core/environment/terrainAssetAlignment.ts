/**
 * Optional viewer-only alignment so facility assets sit flush on local terrain relief.
 */

import * as THREE from 'three';
import {
  LocalTerrainHeightField,
  computeTerrainPlaneNormal,
} from './localTerrainHeightField';
import { isTerrainAlignableNode } from './terrainAssetFootprints';

const _worldUp = new THREE.Vector3(0, 1, 0);
const _box = new THREE.Box3();
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _parentWorldQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _tiltQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _corners = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
];

type BaselineTransform = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

function shouldAlignNode(node: THREE.Object3D): boolean {
  return isTerrainAlignableNode(node);
}

function nodeKey(node: THREE.Object3D): string {
  return String(node.userData.id ?? node.uuid);
}

export type TerrainAssetAlignmentContext = {
  scene: THREE.Scene;
  terrainMesh: THREE.Mesh | null;
};

export class TerrainAssetAlignmentController {
  private enabled = false;
  private readonly baselines = new Map<string, BaselineTransform>();
  private readonly heightField = new LocalTerrainHeightField();

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean, scene?: THREE.Scene): void {
    if (this.enabled && !enabled && scene) {
      this.restoreOnScene(scene);
    }
    this.enabled = enabled;
  }

  clear(scene?: THREE.Scene): void {
    if (scene) {
      this.restoreOnScene(scene);
    }
    this.baselines.clear();
    this.heightField.dispose();
    this.enabled = false;
  }

  apply(context: TerrainAssetAlignmentContext): void {
    if (!this.enabled) return;
    const { scene, terrainMesh } = context;
    if (!terrainMesh) return;

    if (!this.heightField.sync(terrainMesh)) {
      return;
    }

    scene.traverse((node) => {
      if (shouldAlignNode(node)) this.alignNode(node);
    });
  }

  restoreOnScene(scene: THREE.Scene): void {
    if (this.baselines.size === 0) return;

    scene.traverse((node) => {
      if (!shouldAlignNode(node)) return;
      const baseline = this.baselines.get(nodeKey(node));
      if (!baseline) return;
      node.position.copy(baseline.position);
      node.quaternion.copy(baseline.quaternion);
    });
  }

  resetBaselines(): void {
    this.baselines.clear();
  }

  private captureBaseline(node: THREE.Object3D): BaselineTransform {
    const key = nodeKey(node);
    let baseline = this.baselines.get(key);
    if (!baseline) {
      baseline = {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
      };
      this.baselines.set(key, baseline);
    }
    return baseline;
  }

  private alignNode(node: THREE.Object3D): void {
    const baseline = this.captureBaseline(node);
    node.position.copy(baseline.position);
    node.quaternion.copy(baseline.quaternion);
    node.updateWorldMatrix(true, true);

    const footprintSamples = this.sampleFootprintTerrain(node);
    if (!footprintSamples) return;

    const normal = computeTerrainPlaneNormal(footprintSamples);

    node.getWorldQuaternion(_worldQuat);
    _euler.setFromQuaternion(_worldQuat, 'YXZ');
    _yawQuat.setFromAxisAngle(_worldUp, _euler.y);
    _tiltQuat.setFromUnitVectors(_worldUp, normal);

    _worldQuat.copy(_yawQuat).multiply(_tiltQuat);
    if (node.parent) {
      node.parent.getWorldQuaternion(_parentWorldQuat);
      node.quaternion.copy(_parentWorldQuat.invert().multiply(_worldQuat));
    } else {
      node.quaternion.copy(_worldQuat);
    }

    node.updateWorldMatrix(true, true);
    this.liftNodeToTerrain(node);
  }

  private sampleFootprintTerrain(node: THREE.Object3D): THREE.Vector3[] | null {
    _box.setFromObject(node);
    const inset = 0.05;
    const minX = _box.min.x + inset;
    const maxX = _box.max.x - inset;
    const minZ = _box.min.z + inset;
    const maxZ = _box.max.z - inset;

    const xs = [minX, maxX, maxX, minX];
    const zs = [minZ, minZ, maxZ, maxZ];

    for (let i = 0; i < 4; i++) {
      const surfaceY = this.heightField.sampleWorldY(xs[i], zs[i]);
      if (surfaceY === null) return null;
      _corners[i].set(xs[i], surfaceY, zs[i]);
    }

    return _corners;
  }

  private liftNodeToTerrain(node: THREE.Object3D): void {
    node.updateWorldMatrix(true, true);
    _box.setFromObject(node);
    const bottomY = _box.min.y;

    const xs = [_box.min.x, _box.max.x, _box.max.x, _box.min.x];
    const zs = [_box.min.z, _box.min.z, _box.max.z, _box.max.z];

    let lift = 0;
    for (let i = 0; i < 4; i++) {
      const surfaceY = this.heightField.sampleWorldY(xs[i], zs[i]);
      if (surfaceY === null) return;
      const deficit = surfaceY - bottomY;
      if (deficit > lift) lift = deficit;
    }

    if (Math.abs(lift) < 1e-4) return;

    node.getWorldPosition(_worldPos);
    _worldPos.y += lift;
    if (node.parent) {
      node.parent.worldToLocal(_worldPos);
      node.position.copy(_worldPos);
    } else {
      node.position.y += lift;
    }
  }
}
