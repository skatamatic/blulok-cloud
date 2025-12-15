/**
 * Window Manager
 * 
 * Manages instanced rendering of windows for performance optimization.
 * Windows are rendered using THREE.InstancedMesh to batch draw calls.
 * 
 * Also handles window-specific interactions like wall-constrained dragging.
 */

import * as THREE from 'three';
import { GridSystem } from './GridSystem';
import { PlacedObject, BuildingWall } from './types';

/** Instance tracking for a single window */
interface WindowInstance {
  instanceIndex: number;
  placedObjectId: string;
  wallId: string;
  wallPosition: number; // 0-1 position along wall
  assetId: string;
}

/** Batch of instanced meshes for a window type */
interface WindowBatch {
  mesh: THREE.InstancedMesh;
  instances: Map<string, WindowInstance>; // placedObjectId -> instance
  freeIndices: number[];
  maxCount: number;
  assetId: string;
  // Geometry parts for proper window rendering
  frameGeometry: THREE.BufferGeometry;
  glassGeometry: THREE.BufferGeometry;
  frameMaterial: THREE.MeshStandardMaterial;
  glassMaterial: THREE.MeshPhysicalMaterial;
}

/** Wall data for dragging calculations */
interface WallLine {
  id: string;
  startWorld: THREE.Vector3;
  endWorld: THREE.Vector3;
  direction: THREE.Vector3;
  length: number;
  orientation: 'north-south' | 'east-west';
  floorLevel: number;
}

export class WindowManager {
  private scene: THREE.Scene;
  private gridSystem: GridSystem;
  
  // Window batches by asset type
  private windowBatches: Map<string, WindowBatch> = new Map();
  
  // Direct mesh storage (non-instanced fallback for complex windows)
  private windowMeshes: Map<string, THREE.Object3D> = new Map();
  
  // Wall data cache for drag calculations
  private wallCache: Map<string, WallLine> = new Map();
  
  constructor(scene: THREE.Scene, gridSystem: GridSystem) {
    this.scene = scene;
    this.gridSystem = gridSystem;
  }
  
  /**
   * Add a window to the scene (instanced)
   */
  addWindow(
    placedObject: PlacedObject, 
    mesh: THREE.Object3D,
    wall: BuildingWall
  ): void {
    const assetId = placedObject.assetMetadata.id;
    
    // Cache wall data for future drag operations
    this.cacheWallData(wall);
    
    // For now, use direct mesh approach for window complexity
    // Full instancing would require merging all window geometries
    mesh.userData.windowId = placedObject.id;
    mesh.userData.wallId = wall.id;
    mesh.userData.assetId = assetId;
    mesh.userData.isDraggableOnWall = placedObject.assetMetadata.category === 'window';
    
    this.windowMeshes.set(placedObject.id, mesh);
    
    // Don't add to scene - the caller (PlacementManager/Engine) already does that
  }
  
  /**
   * Remove a window from the scene
   */
  removeWindow(placedObjectId: string): void {
    const mesh = this.windowMeshes.get(placedObjectId);
    if (mesh) {
      this.scene.remove(mesh);
      this.disposeMesh(mesh);
      this.windowMeshes.delete(placedObjectId);
    }
  }
  
  /**
   * Get a window mesh by ID
   */
  getWindowMesh(placedObjectId: string): THREE.Object3D | undefined {
    return this.windowMeshes.get(placedObjectId);
  }
  
  /**
   * Check if an object is a draggable window
   */
  isDraggableWindow(object: THREE.Object3D): boolean {
    return object.userData.isDraggableOnWall === true;
  }
  
  /**
   * Cache wall geometry data for drag calculations
   */
  cacheWallData(wall: BuildingWall): void {
    if (this.wallCache.has(wall.id)) return;
    
    const startWorld = this.gridSystem.gridToWorld({ 
      x: wall.startPos.x, 
      z: wall.startPos.z, 
      y: 0 
    });
    const endWorld = this.gridSystem.gridToWorld({ 
      x: wall.endPos.x, 
      z: wall.endPos.z, 
      y: 0 
    });
    
    const direction = new THREE.Vector3().subVectors(endWorld, startWorld).normalize();
    const length = startWorld.distanceTo(endWorld);
    
    // Calculate orientation from wall direction
    const isHorizontal = Math.abs(startWorld.z - endWorld.z) < 0.01;
    const orientation = isHorizontal ? 'east-west' : 'north-south';
    
    this.wallCache.set(wall.id, {
      id: wall.id,
      startWorld: startWorld,
      endWorld: endWorld,
      direction: direction,
      length: length,
      orientation: orientation,
      floorLevel: wall.floorLevel,
    });
  }
  
  /**
   * Update wall cache with new wall data
   */
  updateWallCache(wall: BuildingWall): void {
    this.wallCache.delete(wall.id);
    this.cacheWallData(wall);
  }
  
  /**
   * Clear wall from cache
   */
  clearWallFromCache(wallId: string): void {
    this.wallCache.delete(wallId);
  }
  
  /**
   * Calculate constrained position for a window being dragged along its wall
   * @param windowId The placed object ID of the window
   * @param targetWorldPos The world position the user is dragging to
   * @returns New world position constrained to wall, and position along wall (0-1)
   */
  calculateWallConstrainedPosition(
    windowId: string,
    targetWorldPos: THREE.Vector3
  ): { position: THREE.Vector3; wallPosition: number } | null {
    const mesh = this.windowMeshes.get(windowId);
    if (!mesh) return null;
    
    const wallId = mesh.userData.wallId;
    const wallData = this.wallCache.get(wallId);
    if (!wallData) return null;
    
    // Project target position onto wall line
    const start = wallData.startWorld;
    const dir = wallData.direction;
    
    // Vector from start to target
    const toTarget = new THREE.Vector3().subVectors(targetWorldPos, start);
    
    // Project onto wall direction
    const projection = toTarget.dot(dir);
    
    // Clamp to wall bounds (with some margin for window width)
    const margin = this.gridSystem.getGridSize() * 0.5;
    const clampedProjection = Math.max(margin, Math.min(wallData.length - margin, projection));
    
    // Calculate wall position (0-1)
    const wallPosition = clampedProjection / wallData.length;
    
    // Calculate constrained world position
    const constrainedPos = new THREE.Vector3()
      .copy(start)
      .addScaledVector(dir, clampedProjection);
    
    // Keep Y from current position (floor height)
    constrainedPos.y = mesh.position.y;
    
    return { position: constrainedPos, wallPosition };
  }
  
  /**
   * Move a window along its wall constraint
   */
  moveWindowAlongWall(
    windowId: string, 
    _newWallPosition: number,
    newWorldPosition: THREE.Vector3
  ): void {
    const mesh = this.windowMeshes.get(windowId);
    if (!mesh) return;
    
    mesh.position.copy(newWorldPosition);
  }
  
  /**
   * Get wall data for a window
   */
  getWindowWallData(windowId: string): WallLine | null {
    const mesh = this.windowMeshes.get(windowId);
    if (!mesh) return null;
    
    return this.wallCache.get(mesh.userData.wallId) || null;
  }
  
  /**
   * Dispose a mesh and its resources
   */
  private disposeMesh(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  }
  
  /**
   * Clear all windows
   */
  clear(): void {
    // Clean up direct meshes
    for (const mesh of this.windowMeshes.values()) {
      this.scene.remove(mesh);
      this.disposeMesh(mesh);
    }
    this.windowMeshes.clear();
    
    // Clean up batches
    for (const batch of this.windowBatches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.geometry.dispose();
      if (Array.isArray(batch.mesh.material)) {
        batch.mesh.material.forEach(m => m.dispose());
      } else if (batch.mesh.material) {
        batch.mesh.material.dispose();
      }
      batch.frameGeometry?.dispose();
      batch.glassGeometry?.dispose();
      batch.frameMaterial?.dispose();
      batch.glassMaterial?.dispose();
    }
    this.windowBatches.clear();
    
    this.wallCache.clear();
  }
  
  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clear();
  }
}

