import * as THREE from 'three';
import type { GridSystem } from '../GridSystem';
import {
  computeBuildingMovePreviewCells,
  mergedTranslatedFootprintBounds,
  type BuildingFootprintRect,
} from './buildingMovePreviewGeometry';

const DEFAULT_TILE_COLOR = 0x147fd4;
const DEFAULT_OUTLINE_COLOR = 0x0e5ba3;

export interface BuildingMovePreviewControllerDeps {
  scene: THREE.Scene;
  gridSystem: Pick<GridSystem, 'getGridSize' | 'gridToWorld'>;
  /** World Y for the active floor’s ground plane */
  getFloorY(activeFloor: number): number;
  tileColor?: number;
  outlineColor?: number;
}

/**
 * Low-cost instanced tiles + line outline for building translation drag preview.
 * Owns Three.js resources; call {@link dispose} on engine teardown.
 */
export class BuildingMovePreviewController {
  private readonly scene: THREE.Scene;
  private readonly gridSystem: BuildingMovePreviewControllerDeps['gridSystem'];
  private readonly getFloorY: (activeFloor: number) => number;
  private readonly tileColor: number;
  private readonly outlineColor: number;

  private instancedTiles: THREE.InstancedMesh | null = null;
  private outline: THREE.LineSegments | null = null;

  constructor(deps: BuildingMovePreviewControllerDeps) {
    this.scene = deps.scene;
    this.gridSystem = deps.gridSystem;
    this.getFloorY = deps.getFloorY;
    this.tileColor = deps.tileColor ?? DEFAULT_TILE_COLOR;
    this.outlineColor = deps.outlineColor ?? DEFAULT_OUTLINE_COLOR;
  }

  /**
   * Show or update preview for the given footprints and grid delta.
   */
  show(footprints: BuildingFootprintRect[], deltaX: number, deltaZ: number, activeFloor: number): void {
    const cells = computeBuildingMovePreviewCells(footprints, deltaX, deltaZ);
    if (cells.length === 0) {
      this.hide();
      return;
    }

    const gridSize = this.gridSystem.getGridSize();
    const tileHeight = 0.08;

    if (this.instancedTiles && this.instancedTiles.count !== cells.length) {
      this.disposeInstancedTiles();
    }

    if (!this.instancedTiles) {
      const geometry = new THREE.BoxGeometry(gridSize * 0.95, tileHeight, gridSize * 0.95);
      const material = new THREE.MeshStandardMaterial({
        color: this.tileColor,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        emissive: this.tileColor,
        emissiveIntensity: 0.3,
      });
      this.instancedTiles = new THREE.InstancedMesh(geometry, material, cells.length);
      this.instancedTiles.userData.isPreview = true;
      this.instancedTiles.userData.selectable = false;
      this.instancedTiles.renderOrder = 100;
      this.scene.add(this.instancedTiles);
    }

    const matrix = new THREE.Matrix4();
    const floorY = this.getFloorY(activeFloor);

    for (let i = 0; i < cells.length; i++) {
      const worldPos = this.gridSystem.gridToWorld({ x: cells[i].x, z: cells[i].z, y: 0 });
      matrix.setPosition(
        worldPos.x + gridSize / 2,
        floorY + tileHeight / 2 + 0.01,
        worldPos.z + gridSize / 2
      );
      this.instancedTiles.setMatrixAt(i, matrix);
    }
    this.instancedTiles.instanceMatrix.needsUpdate = true;
    this.instancedTiles.visible = true;

    this.rebuildOutline(footprints, deltaX, deltaZ, floorY);
  }

  hide(): void {
    if (this.instancedTiles) {
      this.instancedTiles.visible = false;
    }
    if (this.outline) {
      this.outline.visible = false;
    }
  }

  dispose(): void {
    this.disposeInstancedTiles();
    this.disposeOutline();
  }

  private disposeInstancedTiles(): void {
    if (this.instancedTiles) {
      this.scene.remove(this.instancedTiles);
      this.instancedTiles.geometry.dispose();
      (this.instancedTiles.material as THREE.Material).dispose();
      this.instancedTiles = null;
    }
  }

  private disposeOutline(): void {
    if (this.outline) {
      this.scene.remove(this.outline);
      this.outline.geometry.dispose();
      (this.outline.material as THREE.Material).dispose();
      this.outline = null;
    }
  }

  private rebuildOutline(
    footprints: BuildingFootprintRect[],
    deltaX: number,
    deltaZ: number,
    floorY: number
  ): void {
    this.disposeOutline();

    const bounds = mergedTranslatedFootprintBounds(footprints, deltaX, deltaZ);
    if (!bounds) return;

    const outlineHeight = 0.15;
    const worldMin = this.gridSystem.gridToWorld({ x: bounds.minX, z: bounds.minZ, y: 0 });
    const worldMax = this.gridSystem.gridToWorld({ x: bounds.maxX + 1, z: bounds.maxZ + 1, y: 0 });

    const y = floorY + outlineHeight;
    const vertices = new Float32Array([
      worldMin.x,
      y,
      worldMin.z,
      worldMax.x,
      y,
      worldMin.z,

      worldMax.x,
      y,
      worldMin.z,
      worldMax.x,
      y,
      worldMax.z,

      worldMax.x,
      y,
      worldMax.z,
      worldMin.x,
      y,
      worldMax.z,

      worldMin.x,
      y,
      worldMax.z,
      worldMin.x,
      y,
      worldMin.z,
    ]);

    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const outlineMaterial = new THREE.LineBasicMaterial({
      color: this.outlineColor,
      linewidth: 2,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });

    this.outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    this.outline.userData.isPreview = true;
    this.outline.userData.selectable = false;
    this.outline.renderOrder = 101;
    this.scene.add(this.outline);
  }
}
