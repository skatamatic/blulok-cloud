/**
 * Viewer-only — flatten local terrain relief near selectable facility assets.
 */

import * as THREE from 'three';
import type { AssetFootprintXZ } from './terrainAssetFootprints';
import { collectTerrainAlignableFootprints, isTerrainAlignableNode } from './terrainAssetFootprints';
import { boxDistanceXZ, buildTerrainFlattenMap, computeFlattenInfluence } from './terrainFlattenMap';
import { LocalTerrainHeightField } from './localTerrainHeightField';

const _terrainBounds = new THREE.Box3();
const _worldPos = new THREE.Vector3();
const _box = new THREE.Box3();

function nodeKey(node: THREE.Object3D): string {
  return String(node.userData.id ?? node.uuid);
}

export class TerrainFlattenController {
  private enabled = false;
  private texture: THREE.DataTexture | null = null;
  private baselineY = 0;
  private distance = 0;
  private blend = 0;
  private footprints: AssetFootprintXZ[] = [];
  private readonly heightField = new LocalTerrainHeightField();
  /** Captured local positions before baseline lift is applied. */
  private readonly assetBaselinePositions = new Map<string, THREE.Vector3>();

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean, terrainMesh?: THREE.Mesh | null, scene?: THREE.Scene): void {
    if (this.enabled && !enabled) {
      if (scene) {
        this.restoreAssetLift(scene);
      }
      this.clearUniforms(terrainMesh ?? null);
    }
    this.enabled = enabled;
  }

  apply(params: {
    scene: THREE.Scene;
    terrainMesh: THREE.Mesh;
    distance: number;
    blend: number;
    baselineY?: number;
  }): void {
    if (!this.enabled) return;

    const { scene, terrainMesh, distance, blend } = params;
    if (params.baselineY !== undefined) {
      this.baselineY = params.baselineY;
    }
    this.distance = distance;
    this.blend = blend;

    const footprints = collectTerrainAlignableFootprints(scene);
    this.footprints = footprints;
    if (footprints.length === 0) {
      this.clearUniforms(terrainMesh);
      this.restoreAssetLift(scene);
      return;
    }

    terrainMesh.updateMatrixWorld(true);
    _terrainBounds.setFromObject(terrainMesh);

    const padding = Math.max(distance, 1) + 2;
    const boundsMinX = _terrainBounds.min.x - padding;
    const boundsMinZ = _terrainBounds.min.z - padding;
    const boundsMaxX = _terrainBounds.max.x + padding;
    const boundsMaxZ = _terrainBounds.max.z + padding;

    const map = buildTerrainFlattenMap({
      footprints,
      boundsMinX,
      boundsMinZ,
      boundsMaxX,
      boundsMaxZ,
      distance,
      blend,
    });

    if (!map) {
      this.clearUniforms(terrainMesh);
      return;
    }

    this.texture?.dispose();
    this.texture = map.texture;
    this.applyUniforms(terrainMesh, map, true);
    this.heightField.sync(terrainMesh);
    this.applyAssetLift(scene);
  }

  /** Update flatten target height without rebuilding the influence map. */
  updateBaseline(terrainMesh: THREE.Mesh, baselineY: number, scene: THREE.Scene): void {
    if (!this.enabled) return;
    this.baselineY = baselineY;
    const material = terrainMesh.material;
    if (material instanceof THREE.ShaderMaterial) {
      material.uniforms.uFlattenBaselineY.value = baselineY;
    }
    this.heightField.sync(terrainMesh);
    this.applyAssetLift(scene);
  }

  clear(terrainMesh?: THREE.Mesh | null, scene?: THREE.Scene): void {
    if (scene) {
      this.restoreAssetLift(scene);
    }
    this.clearUniforms(terrainMesh ?? null);
    this.texture?.dispose();
    this.texture = null;
    this.baselineY = 0;
    this.distance = 0;
    this.blend = 0;
    this.footprints = [];
    this.heightField.dispose();
    this.assetBaselinePositions.clear();
    this.enabled = false;
  }

  private applyUniforms(
    terrainMesh: THREE.Mesh,
    map: {
      texture: THREE.DataTexture;
      originX: number;
      originZ: number;
      spanX: number;
      spanZ: number;
    },
    enabled: boolean
  ): void {
    const material = terrainMesh.material;
    if (!(material instanceof THREE.ShaderMaterial)) return;

    const u = material.uniforms;
    u.uFlattenEnabled.value = enabled ? 1 : 0;
    u.uFlattenMap.value = map.texture;
    u.uFlattenMapOrigin.value.set(map.originX, map.originZ);
    u.uFlattenMapSpan.value.set(map.spanX, map.spanZ);
    u.uFlattenBaselineY.value = this.baselineY;
  }

  private clearUniforms(terrainMesh: THREE.Mesh | null): void {
    if (!terrainMesh) return;
    const material = terrainMesh.material;
    if (!(material instanceof THREE.ShaderMaterial)) return;

    const u = material.uniforms;
    u.uFlattenEnabled.value = 0;
    u.uFlattenMap.value = null;
    u.uFlattenBaselineY.value = 0;
  }

  /**
   * Lift each asset so its footprint rests on the *actual* flattened terrain surface
   * beneath it. Directly under an asset the shader only blends `blend` of the way toward
   * the baseline, so lifting by the raw baseline would float assets; sampling the real
   * surface keeps them flush regardless of the blend amount.
   */
  private applyAssetLift(scene: THREE.Scene): void {
    if (!this.heightField.isReady()) {
      this.restoreAssetLift(scene);
      return;
    }

    scene.traverse((node) => {
      if (!isTerrainAlignableNode(node)) return;

      const key = nodeKey(node);
      if (!this.assetBaselinePositions.has(key)) {
        this.assetBaselinePositions.set(key, node.position.clone());
      }

      const base = this.assetBaselinePositions.get(key)!;
      node.position.copy(base);
      node.updateWorldMatrix(true, true);

      _box.setFromObject(node);
      if (_box.isEmpty()) return;
      const bottomY = _box.min.y;
      const midX = (_box.min.x + _box.max.x) * 0.5;
      const midZ = (_box.min.z + _box.max.z) * 0.5;

      const xs = [_box.min.x, _box.max.x, _box.max.x, _box.min.x, midX];
      const zs = [_box.min.z, _box.min.z, _box.max.z, _box.max.z, midZ];

      let targetY = -Infinity;
      for (let i = 0; i < xs.length; i++) {
        const surfaceY = this.sampleFlattenedWorldY(xs[i], zs[i]);
        if (surfaceY === null) continue;
        if (surfaceY > targetY) targetY = surfaceY;
      }
      if (targetY === -Infinity) return;

      const lift = targetY - bottomY;
      if (Math.abs(lift) < 1e-4) return;

      node.getWorldPosition(_worldPos);
      _worldPos.y += lift;
      if (node.parent) {
        node.parent.worldToLocal(_worldPos);
        node.position.copy(_worldPos);
      } else {
        node.position.y = base.y + lift;
      }
    });
  }

  /** World-space terrain Y at (x,z) after the shader's flatten blend toward the baseline. */
  private sampleFlattenedWorldY(worldX: number, worldZ: number): number | null {
    const rawY = this.heightField.sampleWorldY(worldX, worldZ);
    if (rawY === null) return null;

    const influence = this.influenceAt(worldX, worldZ);
    if (influence <= 0) return rawY;

    const meshY = this.heightField.getMeshPositionY();
    const vHeight = rawY - meshY;
    const flattenedVHeight = vHeight * (1 - influence) + this.baselineY * influence;
    return meshY + flattenedVHeight;
  }

  private influenceAt(worldX: number, worldZ: number): number {
    let influence = 0;
    for (const footprint of this.footprints) {
      const dist = boxDistanceXZ(worldX, worldZ, footprint);
      const value = computeFlattenInfluence(dist, this.distance, this.blend);
      if (value > influence) influence = value;
    }
    return influence;
  }

  private restoreAssetLift(scene: THREE.Scene): void {
    if (this.assetBaselinePositions.size === 0) return;

    scene.traverse((node) => {
      if (!isTerrainAlignableNode(node)) return;
      const base = this.assetBaselinePositions.get(nodeKey(node));
      if (base) node.position.copy(base);
    });
  }
}
