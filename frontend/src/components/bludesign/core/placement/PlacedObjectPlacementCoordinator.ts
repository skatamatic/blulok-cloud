import * as THREE from 'three';
import { AssetFactory } from '../../assets/AssetFactory';
import type { BuildingManager } from '../BuildingManager';
import type { FloorManager } from '../FloorManager';
import type { GridSystem } from '../GridSystem';
import type { GroundTileManager } from '../GroundTileManager';
import type { SceneManager } from '../SceneManager';
import type { CategorySkin } from '../SkinRegistry';
import { AssetMetadata, FLOOR_HEIGHT, Orientation, PlacedObject } from '../types';
import { getEffectiveRotation } from './effectiveRotation';
import { ORIGINAL_MATERIALS_SKIN_ID } from './placementConstants';

export interface PlacementMaterialHooks {
  storeDefaultMaterials(object: THREE.Object3D): void;
  resetToDefaultMaterials(group: THREE.Group): void;
  applySkinToObject(object: THREE.Group, skin: CategorySkin): void;
  applyActiveThemeSkin(object: THREE.Object3D, objectData?: PlacedObject): void;
}

/**
 * Dependencies for placed-object placement (mocked in unit tests).
 */
export interface PlacedObjectPlacementPorts {
  gridSystem: Pick<
    GridSystem,
    | 'getGridSize'
    | 'gridToWorld'
    | 'getFootprintCenterWorld'
    | 'getGridAlignment'
    | 'markOccupied'
    | 'markOccupiedAlignedFootprint'
  >;
  scene: THREE.Scene;
  sceneManager: Pick<SceneManager, 'addObject' | 'removeObject'>;
  buildingManager: Pick<BuildingManager, 'getWallMesh' | 'getWall' | 'addWallOpening'>;
  groundTileManager: Pick<GroundTileManager, 'isGroundTileCategory' | 'addTile' | 'removeTile'>;
  floorManager: Pick<FloorManager, 'applyGhostingToObject'>;
  materials: PlacementMaterialHooks;
  getSkinById(skinId: string): CategorySkin | undefined;
}

/**
 * Centralizes mesh / ground-tile placement paths used by the engine (load, undo/redo, interactive, batch).
 */
export class PlacedObjectPlacementCoordinator {
  constructor(private readonly deps: PlacedObjectPlacementPorts) {}

  /**
   * Restore an object from facility save data (walls, skins, ghosting).
   */
  placeFromSavedData(obj: PlacedObject): void {
    const mesh = AssetFactory.createAssetMesh(obj.assetMetadata);

    const gridSize = this.deps.gridSystem.getGridSize();
    const worldPos = this.deps.gridSystem.gridToWorld(obj.position);
    const floorY = (obj.floor ?? 0) * FLOOR_HEIGHT * gridSize;

    const isRotated90 = obj.orientation === Orientation.EAST || obj.orientation === Orientation.WEST;
    const effectiveWidth = isRotated90 ? obj.assetMetadata.gridUnits.z : obj.assetMetadata.gridUnits.x;
    const effectiveDepth = isRotated90 ? obj.assetMetadata.gridUnits.x : obj.assetMetadata.gridUnits.z;

    const isWallAttached =
      (obj.assetMetadata.category === 'door' || obj.assetMetadata.category === 'window') && obj.wallAttachment;

    if (isWallAttached && obj.wallAttachment) {
      const wallMesh = this.deps.buildingManager.getWallMesh(obj.wallAttachment.wallId);
      if (wallMesh) {
        const wallPos = wallMesh.position.clone();
        mesh.position.copy(wallPos);
        mesh.position.y = floorY;
        mesh.rotation.y = getEffectiveRotation(obj);

        const opening = {
          id: `opening-${obj.id}`,
          type: obj.assetMetadata.category as 'door' | 'window',
          objectId: obj.id,
          position: obj.wallAttachment.position ?? 0.5,
          width: Math.max(obj.assetMetadata.gridUnits.x, obj.assetMetadata.gridUnits.z),
        };
        this.deps.buildingManager.addWallOpening(obj.wallAttachment.wallId, opening);
      } else {
        const existingYOffset = mesh.position.y;
        mesh.position.set(
          worldPos.x + (effectiveWidth * gridSize) / 2,
          floorY + existingYOffset,
          worldPos.z + (effectiveDepth * gridSize) / 2
        );
        mesh.rotation.y = getEffectiveRotation(obj);
      }
    } else {
      const existingXOffset = mesh.position.x;
      const existingYOffset = mesh.position.y;
      const existingZOffset = mesh.position.z;

      mesh.userData.internalXOffset = existingXOffset;
      mesh.userData.internalYOffset = existingYOffset;
      mesh.userData.internalZOffset = existingZOffset;

      if (obj.exactMeshPos) {
        mesh.position.set(obj.exactMeshPos.x, floorY + existingYOffset, obj.exactMeshPos.z);
      } else {
        mesh.position.set(
          worldPos.x + (effectiveWidth * gridSize) / 2 + existingXOffset,
          floorY + existingYOffset,
          worldPos.z + (effectiveDepth * gridSize) / 2 + existingZOffset
        );
      }
      mesh.rotation.y = getEffectiveRotation(obj);
    }

    if (mesh.userData.internalYOffset === undefined) {
      mesh.userData.internalYOffset = mesh.position.y - floorY;
    }

    mesh.userData.id = obj.id;
    mesh.userData.assetId = obj.assetId;
    mesh.userData.gridPosition = obj.position;
    mesh.userData.isSmart = obj.assetMetadata.isSmart;
    mesh.userData.category = obj.assetMetadata.category;
    mesh.userData.floor = obj.floor ?? 0;
    mesh.userData.selectable = true;

    this.deps.sceneManager.addObject(obj.id, mesh, obj);

    this.deps.materials.storeDefaultMaterials(mesh);

    if (obj.skinId) {
      if (obj.skinId === ORIGINAL_MATERIALS_SKIN_ID) {
        this.deps.materials.resetToDefaultMaterials(mesh as THREE.Group);
      } else {
        const skin = this.deps.getSkinById(obj.skinId);
        if (skin) {
          this.deps.materials.applySkinToObject(mesh as THREE.Group, skin);
        } else {
          console.warn(`[placeFromSavedData] Skin "${obj.skinId}" not found, falling back to theme`);
          this.deps.materials.applyActiveThemeSkin(mesh as THREE.Group, obj);
        }
      }
    } else {
      this.deps.materials.applyActiveThemeSkin(mesh as THREE.Group, obj);
    }

    this.deps.floorManager.applyGhostingToObject(mesh);
  }

  /**
   * Undo/redo placement without history side effects (matches legacy `placeObjectInternal`).
   */
  placeForHistory(placedObject: PlacedObject): void {
    const asset = placedObject.assetMetadata;
    if (!asset) {
      console.error('Asset metadata not found for:', placedObject.assetId);
      return;
    }

    if (this.deps.groundTileManager.isGroundTileCategory(asset.category)) {
      const marker = this.deps.groundTileManager.addTile(
        placedObject.id,
        asset.category,
        placedObject.position
      );

      this.deps.sceneManager.addObject(placedObject.id, marker, placedObject, { trackOnly: true });

      if (this.deps.gridSystem.getGridAlignment()) {
        this.deps.gridSystem.markOccupiedAlignedFootprint(
          placedObject.id,
          placedObject.position,
          { x: asset.gridUnits.x, z: asset.gridUnits.z },
          asset.canStack ?? false,
          asset.category,
          placedObject.floor ?? 0
        );
      } else {
        this.deps.gridSystem.markOccupied(
          placedObject.id,
          placedObject.position,
          { x: asset.gridUnits.x, z: asset.gridUnits.z },
          asset.canStack,
          asset.category,
          placedObject.floor ?? 0
        );
      }
      return;
    }

    const mesh = AssetFactory.createAssetMesh(asset);
    const gridSize = this.deps.gridSystem.getGridSize();
    const floorY = (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize;

    const existingXOffset = mesh.position.x;
    const existingYOffset = mesh.position.y;
    const existingZOffset = mesh.position.z;
    mesh.userData.internalXOffset = existingXOffset;
    mesh.userData.internalYOffset = existingYOffset;
    mesh.userData.internalZOffset = existingZOffset;

    if (placedObject.exactMeshPos) {
      mesh.position.set(
        placedObject.exactMeshPos.x,
        floorY + existingYOffset,
        placedObject.exactMeshPos.z
      );
    } else {
      const isRotated90 =
        placedObject.orientation === Orientation.EAST || placedObject.orientation === Orientation.WEST;
      const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
      const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
      const centerWorld = this.deps.gridSystem.getFootprintCenterWorld(placedObject.position, {
        x: effectiveGridX,
        z: effectiveGridZ,
      });

      mesh.position.set(
        centerWorld.x + existingXOffset,
        floorY + existingYOffset,
        centerWorld.z + existingZOffset
      );
    }
    mesh.rotation.y = getEffectiveRotation(placedObject);

    mesh.userData.floor = placedObject.floor ?? 0;
    mesh.userData.selectable = true;

    this.deps.sceneManager.addObject(placedObject.id, mesh, placedObject);

    if (!placedObject.skinId) {
      this.deps.materials.applyActiveThemeSkin(mesh, placedObject);
    }

    this.deps.floorManager.applyGhostingToObject(mesh);

    if (this.deps.gridSystem.getGridAlignment()) {
      this.deps.gridSystem.markOccupiedAlignedFootprint(
        placedObject.id,
        placedObject.position,
        { x: asset.gridUnits.x, z: asset.gridUnits.z },
        asset.canStack ?? false,
        asset.category,
        placedObject.floor ?? 0
      );
    } else {
      this.deps.gridSystem.markOccupied(
        placedObject.id,
        placedObject.position,
        { x: asset.gridUnits.x, z: asset.gridUnits.z },
        asset.canStack,
        asset.category,
        placedObject.floor ?? 0
      );
    }
  }

  /**
   * Single interactive placement (editor paint / click), including wall snap and ground replace.
   */
  placeInteractiveSingle(placedObject: PlacedObject, asset: AssetMetadata): void {
    if (this.deps.groundTileManager.isGroundTileCategory(asset.category)) {
      const marker = this.deps.groundTileManager.addTile(
        placedObject.id,
        asset.category,
        placedObject.position
      );

      this.deps.sceneManager.addObject(placedObject.id, marker, placedObject, { trackOnly: true });

      const size = { x: asset.gridUnits.x, z: asset.gridUnits.z };
      const replacedGroundId = this.deps.gridSystem.markOccupied(
        placedObject.id,
        placedObject.position,
        size,
        asset.canStack,
        asset.category,
        placedObject.floor ?? 0
      );

      if (replacedGroundId) {
        this.deps.groundTileManager.removeTile(replacedGroundId);
        this.deps.sceneManager.removeObject(replacedGroundId);
      }
      return;
    }

    const mesh = AssetFactory.createAssetMesh(asset);
    const gridSize = this.deps.gridSystem.getGridSize();
    const floorY = (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize;

    const existingXOffset = mesh.position.x;
    const existingYOffset = mesh.position.y;
    const existingZOffset = mesh.position.z;
    mesh.userData.internalXOffset = existingXOffset;
    mesh.userData.internalYOffset = existingYOffset;
    mesh.userData.internalZOffset = existingZOffset;

    if (placedObject.exactMeshPos) {
      mesh.position.set(
        placedObject.exactMeshPos.x,
        floorY + existingYOffset,
        placedObject.exactMeshPos.z
      );
    } else {
      const isRotated90 =
        placedObject.orientation === Orientation.EAST || placedObject.orientation === Orientation.WEST;
      const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
      const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
      const centerWorld = this.deps.gridSystem.getFootprintCenterWorld(placedObject.position, {
        x: effectiveGridX,
        z: effectiveGridZ,
      });

      mesh.position.set(
        centerWorld.x + existingXOffset,
        floorY + existingYOffset,
        centerWorld.z + existingZOffset
      );
    }

    mesh.userData.floor = placedObject.floor ?? 0;
    mesh.userData.selectable = true;
    mesh.userData.verticalShaftId = placedObject.verticalShaftId;
    mesh.userData.assetId = asset.id;
    mesh.userData.category = asset.category;
    mesh.userData.isSmart = asset.isSmart;
    mesh.userData.id = placedObject.id;
    mesh.userData.gridPosition = placedObject.position;

    if (placedObject.wallAttachment?.wallId) {
      const wall = this.deps.buildingManager.getWall(placedObject.wallAttachment.wallId);
      if (wall) {
        const startWorld = this.deps.gridSystem.gridToWorld(wall.startPos);
        const endWorld = this.deps.gridSystem.gridToWorld(wall.endPos);
        const cx = (startWorld.x + endWorld.x) / 2;
        const cz = (startWorld.z + endWorld.z) / 2;
        mesh.position.x = cx;
        mesh.position.z = cz;

        const dx = endWorld.x - startWorld.x;
        const dz = endWorld.z - startWorld.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.0001) {
          const nx = -dz / len;
          const nz = dx / len;
          const wallThickness = 0.2;
          const offset = wallThickness * 0.5 - 0.01;
          mesh.position.x += nx * offset;
          mesh.position.z += nz * offset;
        }
      }
    }

    mesh.rotation.y = getEffectiveRotation(placedObject);

    this.deps.sceneManager.addObject(placedObject.id, mesh, placedObject);

    this.deps.materials.storeDefaultMaterials(mesh);

    if (placedObject.skinId) {
      if (placedObject.skinId === ORIGINAL_MATERIALS_SKIN_ID) {
        this.deps.materials.resetToDefaultMaterials(mesh as THREE.Group);
      } else {
        const skin = this.deps.getSkinById(placedObject.skinId);
        if (skin) {
          this.deps.materials.applySkinToObject(mesh as THREE.Group, skin);
        } else {
          this.deps.materials.applyActiveThemeSkin(mesh, placedObject);
        }
      }
    } else {
      this.deps.materials.applyActiveThemeSkin(mesh, placedObject);
    }

    this.deps.floorManager.applyGhostingToObject(mesh);

    const size = { x: asset.gridUnits.x, z: asset.gridUnits.z };
    const replacedGroundId = this.deps.gridSystem.markOccupied(
      placedObject.id,
      placedObject.position,
      size,
      asset.canStack,
      asset.category,
      placedObject.floor ?? 0
    );

    if (replacedGroundId) {
      this.deps.groundTileManager.removeTile(replacedGroundId);
      this.deps.sceneManager.removeObject(replacedGroundId);
    }
  }

  /**
   * Non–ground-tile branch of batch placement (e.g. row paint of smart assets).
   */
  placeBatchNonGroundMesh(placedObject: PlacedObject, asset: AssetMetadata): void {
    const mesh = AssetFactory.createAssetMesh(asset);
    const gridSize = this.deps.gridSystem.getGridSize();
    const floorY = (placedObject.floor ?? 0) * FLOOR_HEIGHT * gridSize;

    const existingXOffset = mesh.position.x;
    const existingYOffset = mesh.position.y;
    const existingZOffset = mesh.position.z;
    mesh.userData.internalXOffset = existingXOffset;
    mesh.userData.internalYOffset = existingYOffset;
    mesh.userData.internalZOffset = existingZOffset;

    if (placedObject.exactMeshPos) {
      mesh.position.set(
        placedObject.exactMeshPos.x,
        floorY + existingYOffset,
        placedObject.exactMeshPos.z
      );
    } else {
      const isRotated90 =
        placedObject.orientation === Orientation.EAST || placedObject.orientation === Orientation.WEST;
      const effectiveGridX = isRotated90 ? asset.gridUnits.z : asset.gridUnits.x;
      const effectiveGridZ = isRotated90 ? asset.gridUnits.x : asset.gridUnits.z;
      const centerWorld = this.deps.gridSystem.getFootprintCenterWorld(placedObject.position, {
        x: effectiveGridX,
        z: effectiveGridZ,
      });

      mesh.position.set(
        centerWorld.x + existingXOffset,
        floorY + existingYOffset,
        centerWorld.z + existingZOffset
      );
    }

    mesh.userData.floor = placedObject.floor ?? 0;
    mesh.userData.selectable = true;

    mesh.rotation.y = getEffectiveRotation(placedObject);

    this.deps.sceneManager.addObject(placedObject.id, mesh, placedObject);

    this.deps.materials.storeDefaultMaterials(mesh);

    if (placedObject.skinId) {
      if (placedObject.skinId === ORIGINAL_MATERIALS_SKIN_ID) {
        this.deps.materials.resetToDefaultMaterials(mesh as THREE.Group);
      } else {
        const skin = this.deps.getSkinById(placedObject.skinId);
        if (skin) {
          this.deps.materials.applySkinToObject(mesh as THREE.Group, skin);
        } else {
          this.deps.materials.applyActiveThemeSkin(mesh, placedObject);
        }
      }
    } else {
      this.deps.materials.applyActiveThemeSkin(mesh, placedObject);
    }

    this.deps.floorManager.applyGhostingToObject(mesh);

    const size = { x: asset.gridUnits.x, z: asset.gridUnits.z };
    const replacedGroundId = this.deps.gridSystem.markOccupied(
      placedObject.id,
      placedObject.position,
      size,
      asset.canStack,
      asset.category,
      placedObject.floor ?? 0
    );

    if (replacedGroundId) {
      this.deps.sceneManager.removeObject(replacedGroundId);
    }
  }
}
