/**
 * Object Management Service
 * 
 * Handles object manipulation operations including:
 * - Object deletion
 * - Object updates (position, rotation, skin)
 * - Simulation state changes
 * - Selection management coordination
 * 
 * This service is part of the SOLID refactoring of BluDesignEngine.
 */

import * as THREE from 'three';
import { 
  AssetCategory, 
  PlacedObject, 
  DeviceState,
} from '../types';
import { SceneManager } from '../SceneManager';
import { BuildingManager } from '../BuildingManager';
import { GroundTileManager } from '../GroundTileManager';
import { AssetFactory } from '../../assets/AssetFactory';
import { CategorySkin, getSkinRegistry } from '../SkinRegistry';

export interface ManagementContext {
  scene: THREE.Scene;
  sceneManager: SceneManager;
  buildingManager: BuildingManager;
  groundTileManager: GroundTileManager;
  placedObjects: Map<string, PlacedObject>;
}

export class ObjectManagementService {
  private context: ManagementContext;
  
  constructor(context: ManagementContext) {
    this.context = context;
  }
  
  /**
   * Update the context (called when engine state changes)
   */
  updateContext(updates: Partial<ManagementContext>): void {
    this.context = { ...this.context, ...updates };
  }
  
  /**
   * Delete an object by ID
   */
  deleteObject(objectId: string): boolean {
    const { sceneManager, groundTileManager, placedObjects, buildingManager } = this.context;
    
    const placedObj = placedObjects.get(objectId);
    if (!placedObj) {
      console.warn(`Object not found for deletion: ${objectId}`);
      return false;
    }
    
    // Check if it's a ground tile
    const isGroundTile = placedObj.assetMetadata && [
      AssetCategory.PAVEMENT,
      AssetCategory.GRASS,
      AssetCategory.GRAVEL
    ].includes(placedObj.assetMetadata.category);
    
    if (isGroundTile) {
      groundTileManager.removeTile(objectId);
    } else {
      // Find the mesh in the scene
      const mesh = sceneManager.getObject(objectId);
      if (mesh) {
        // If this is a window, remove wall opening
        if (placedObj.assetMetadata?.category === AssetCategory.WINDOW && placedObj.wallAttachment) {
          buildingManager.removeWallOpening(placedObj.wallAttachment.wallId, objectId);
        }
        
        sceneManager.removeObject(objectId);
      }
    }
    
    // Remove from placed objects
    placedObjects.delete(objectId);
    
    return true;
  }
  
  /**
   * Update object skin
   */
  updateObjectSkin(objectId: string, skinId: string | null): boolean {
    const { sceneManager, placedObjects } = this.context;
    
    const placedObj = placedObjects.get(objectId);
    if (!placedObj) {
      console.warn(`Object not found for skin update: ${objectId}`);
      return false;
    }
    
    // Update the stored skin ID
    placedObj.skinId = skinId || undefined;
    
    // Find the mesh and apply the skin
    const mesh = sceneManager.getObject(objectId);
    if (mesh instanceof THREE.Group) {
      if (skinId) {
        const skin = getSkinRegistry().getSkin(skinId);
        if (skin) {
          this.applySkinToMesh(mesh, skin);
        }
      } else {
        // Reset to default materials
        this.resetMeshToDefaults(mesh);
      }
    }
    
    return true;
  }
  
  /**
   * Apply a skin to a mesh
   */
  private applySkinToMesh(mesh: THREE.Group, skin: CategorySkin): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const partName = child.userData.partName;
        if (partName && skin.partMaterials[partName]) {
          const partMat = skin.partMaterials[partName];
          const material = child.material as THREE.MeshStandardMaterial;
          
          if (material && material.color) {
            material.color.set(partMat.color);
            material.metalness = partMat.metalness;
            material.roughness = partMat.roughness;
            
            if (partMat.transparent !== undefined) {
              material.transparent = partMat.transparent;
              material.opacity = partMat.opacity ?? 1;
              material.depthWrite = !partMat.transparent;
            }
            
            material.needsUpdate = true;
          }
        }
      }
    });
  }
  
  /**
   * Reset mesh to default materials
   */
  private resetMeshToDefaults(mesh: THREE.Group): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.defaultMaterial) {
        const defaults = child.userData.defaultMaterial;
        const material = child.material as THREE.MeshStandardMaterial;
        
        if (material && material.color) {
          material.color.setHex(defaults.color);
          material.metalness = defaults.metalness;
          material.roughness = defaults.roughness;
          material.transparent = defaults.transparent ?? false;
          material.opacity = defaults.opacity ?? 1;
          material.needsUpdate = true;
        }
      }
    });
  }
  
  /**
   * Update object position
   */
  updateObjectPosition(objectId: string, newPosition: { x: number; z: number }): boolean {
    const { sceneManager, placedObjects } = this.context;
    
    const placedObj = placedObjects.get(objectId);
    if (!placedObj) {
      console.warn(`Object not found for position update: ${objectId}`);
      return false;
    }
    
    // Update stored position
    placedObj.position.x = newPosition.x;
    placedObj.position.z = newPosition.z;
    
    // Update mesh position
    const mesh = sceneManager.getObject(objectId);
    if (mesh) {
      const gridSize = 1; // Should be from context
      mesh.position.x = newPosition.x * gridSize;
      mesh.position.z = newPosition.z * gridSize;
    }
    
    return true;
  }
  
  /**
   * Update object rotation
   */
  updateObjectRotation(objectId: string, rotation: number): boolean {
    const { sceneManager, placedObjects } = this.context;
    
    const placedObj = placedObjects.get(objectId);
    if (!placedObj) {
      console.warn(`Object not found for rotation update: ${objectId}`);
      return false;
    }
    
    // Update stored rotation
    placedObj.rotation = rotation;
    
    // Update mesh rotation
    const mesh = sceneManager.getObject(objectId);
    if (mesh) {
      mesh.rotation.y = rotation;
    }
    
    return true;
  }
  
  /**
   * Simulate object state (for smart assets)
   */
  simulateObjectState(objectId: string, state: DeviceState): boolean {
    const { sceneManager, placedObjects } = this.context;
    
    const placedObj = placedObjects.get(objectId);
    if (!placedObj || !placedObj.binding) {
      console.warn(`Object not found or not smart: ${objectId}`);
      return false;
    }
    
    // Update the binding state
    placedObj.binding.currentState = state;
    
    // Find the mesh and update its visual state
    const mesh = sceneManager.getObject(objectId);
    if (mesh instanceof THREE.Group) {
      AssetFactory.updateAssetState(mesh, state);
    }
    
    return true;
  }
  
  /**
   * Get all placed objects
   */
  getAllObjects(): PlacedObject[] {
    return Array.from(this.context.placedObjects.values());
  }
  
  /**
   * Get object by ID
   */
  getObject(objectId: string): PlacedObject | undefined {
    return this.context.placedObjects.get(objectId);
  }
  
  /**
   * Get objects by category
   */
  getObjectsByCategory(category: AssetCategory): PlacedObject[] {
    return this.getAllObjects().filter(obj => 
      obj.assetMetadata?.category === category
    );
  }
  
  /**
   * Get objects on a specific floor
   */
  getObjectsOnFloor(floor: number): PlacedObject[] {
    return this.getAllObjects().filter(obj => obj.floor === floor);
  }
}

