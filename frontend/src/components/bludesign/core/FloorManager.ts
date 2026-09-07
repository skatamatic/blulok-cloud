/**
 * Floor Manager
 * 
 * Manages floor navigation, ghosting effects, and floor-related operations.
 */

import * as THREE from 'three';
import { FLOOR_HEIGHT } from './types';
import { GridSystem } from './GridSystem';

export interface FloorGhostingConfig {
  floorsAboveOpacity: number;
  floorsBelowOpacity: number;
  fullBuildingViewOpacity: number;
  currentFloorWallOpacity: number; // Opacity for walls on the current floor (default 0.5)
}

export interface FloorManagerCallbacks {
  onFloorChanged: (floor: number) => void;
  onFloorModeChanged: (isFloorMode: boolean) => void;
}

// Animation duration for opacity transitions (ms)
const OPACITY_ANIMATION_DURATION = 200;

export class FloorManager {
  private scene: THREE.Scene;
  private gridSystem: GridSystem;
  private callbacks: FloorManagerCallbacks;
  
  private currentFloor: number = 0;
  private isFullBuildingView: boolean = false;
  private availableFloors: Set<number> = new Set([0]);
  
  // Configurable ghosting opacity values
  private ghostingConfig: FloorGhostingConfig = {
    floorsAboveOpacity: 0.2,
    floorsBelowOpacity: 0.2,
    fullBuildingViewOpacity: 0.85, // Use 85% opacity in full building view for better visual clarity
    currentFloorWallOpacity: 0.5, // Walls on current floor are semi-transparent to see inside
  };
  
  // Opacity animation state
  private activeAnimations: Map<THREE.Material, {
    startOpacity: number;
    targetOpacity: number;
    startTime: number;
    duration: number;
  }> = new Map();
  private animationFrameId: number | null = null;

  constructor(
    scene: THREE.Scene,
    gridSystem: GridSystem,
    callbacks: FloorManagerCallbacks
  ) {
    this.scene = scene;
    this.gridSystem = gridSystem;
    this.callbacks = callbacks;
  }

  /**
   * Update ghosting configuration
   */
  setGhostingConfig(config: Partial<FloorGhostingConfig>): void {
    this.ghostingConfig = {
      ...this.ghostingConfig,
      ...config,
    };
    
    // Re-apply ghosting with new values
    if (this.isFullBuildingView) {
      this.applyFullBuildingGhosting();
    } else {
      this.applyGhosting();
    }
  }

  /**
   * Get current ghosting configuration
   */
  getGhostingConfig(): FloorGhostingConfig {
    return { ...this.ghostingConfig };
  }

  /**
   * Set the current floor
   */
  setFloor(level: number): void {
    this.currentFloor = level;
    this.availableFloors.add(level);
    
    // Update grid Y position to this floor's level
    const gridSize = this.gridSystem.getGridSize();
    const floorY = level * FLOOR_HEIGHT * gridSize;
    this.gridSystem.setGridY(floorY);
    
    
    // Apply ghosting - objects on other floors become semi-transparent
    if (!this.isFullBuildingView) {
      this.applyGhosting();
    }
    
    this.callbacks.onFloorChanged(level);
  }

  /**
   * Get the current floor's Y world position
   */
  getCurrentFloorY(): number {
    const gridSize = this.gridSystem.getGridSize();
    return this.currentFloor * FLOOR_HEIGHT * gridSize;
  }

  /**
   * Get the Y world position for a specific floor level
   */
  getFloorY(level: number): number {
    const gridSize = this.gridSystem.getGridSize();
    return level * FLOOR_HEIGHT * gridSize;
  }

  /**
   * Get current floor level
   */
  getCurrentFloor(): number {
    return this.currentFloor;
  }

  /**
   * Toggle between floor mode and full building view
   */
  setFullBuildingView(enabled: boolean): void {
    this.isFullBuildingView = enabled;
    
    if (enabled) {
      // Return grid to ground level when viewing all floors
      this.gridSystem.setGridY(0);
      // Show all floors with configurable opacity (or full opacity if set to 1)
      this.applyFullBuildingGhosting();
    } else {
      // Apply floor-based ghosting
      this.applyGhosting();
    }
    
    this.callbacks.onFloorModeChanged(!enabled);
  }

  /**
   * Check if in full building view
   */
  isInFullBuildingView(): boolean {
    return this.isFullBuildingView;
  }

  /**
   * Apply ghosting based on current floor
   * All floors visible with configurable opacity, using render order to prevent artifacts
   * Handles both regular meshes and InstancedMesh batches (for building optimization)
   */
  applyGhosting(): void {
    // Process objects with floor data (can be Groups or Meshes)
    const processedObjects = new Set<THREE.Object3D>();
    
    this.scene.traverse((object) => {
      // Skip if already processed (child of a floor-tagged group)
      if (processedObjects.has(object)) return;
      
      // Skip system objects (grid, ground plane, helpers)
      if (this.shouldSkipGhosting(object)) {
        processedObjects.add(object);
        return;
      }
      
      // Hide roofs in floor mode (roofs only visible in Full View mode)
      if (object.userData.isRoof || object.userData.isBatchedRoofTiles) {
        object.visible = false;
        processedObjects.add(object);
        return;
      }
      
      // Handle InstancedMesh batches (floor tiles and walls from BuildingManager)
      if (object instanceof THREE.InstancedMesh && object.userData.floorLevel !== undefined) {
        const floorLevel = object.userData.floorLevel as number;
        const isWallBatch = object.userData.isBatchedWalls === true;
        
        // Determine opacity for this floor's batch
        let opacity = 1.0;
        if (floorLevel === this.currentFloor) {
          // Current floor: walls get configurable opacity, floor tiles get full opacity
          opacity = isWallBatch ? this.ghostingConfig.currentFloorWallOpacity : 1.0;
        } else if (floorLevel > this.currentFloor) {
          opacity = this.ghostingConfig.floorsAboveOpacity;
        } else {
          opacity = this.ghostingConfig.floorsBelowOpacity;
        }
        
        // Set opacity on the InstancedMesh material
        object.renderOrder = floorLevel * 10;
        this.setInstancedMeshOpacity(object, opacity);
        processedObjects.add(object);
        return;
      }
      
      // Handle individual wall meshes (non-instanced)
      if (object.userData.isBuildingWall || object.userData.isWall) {
        const wallFloor = object.userData.floor ?? 0;
        processedObjects.add(object);
        object.visible = true;
        
        // Walls on current floor get configurable opacity
        let opacity = 1.0;
        if (wallFloor === this.currentFloor) {
          opacity = this.ghostingConfig.currentFloorWallOpacity;
        } else if (wallFloor > this.currentFloor) {
          opacity = this.ghostingConfig.floorsAboveOpacity;
        } else {
          opacity = this.ghostingConfig.floorsBelowOpacity;
        }
        
        object.renderOrder = wallFloor * 10;
        if (object instanceof THREE.Mesh) {
          this.setObjectOpacity(object, opacity);
        }
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.renderOrder = wallFloor * 10;
            this.setObjectOpacity(child, opacity);
          }
        });
        return;
      }
      
      // Check if this object has floor data (placed objects like units, doors, etc.)
      if (object.userData.floor !== undefined) {
        const objectFloor = object.userData.floor as number;
        
        // Mark this object and all descendants as processed
        object.traverse(child => processedObjects.add(child));
        
        // All floors visible
        object.visible = true;
        
        // Set render order based on floor level (lower floors render first)
        object.renderOrder = objectFloor * 10;
        
        // Determine opacity - current floor is FULLY OPAQUE (1.0)
        let opacity = 1.0;
        if (objectFloor === this.currentFloor) {
          opacity = 1.0; // Current floor objects: always fully opaque!
        } else if (objectFloor > this.currentFloor) {
          opacity = this.ghostingConfig.floorsAboveOpacity;
        } else {
          opacity = this.ghostingConfig.floorsBelowOpacity;
        }
        
        
        // Apply opacity to this object and all child meshes
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.renderOrder = objectFloor * 10;
            this.setObjectOpacity(child, opacity);
          }
        });
      }
    });
    
  }

  /**
   * Apply full building view - all floors visible with configurable opacity
   * Handles both regular meshes, InstancedMesh batches, and roofs
   */
  applyFullBuildingGhosting(): void {
    const opacity = this.ghostingConfig.fullBuildingViewOpacity;
    const processedObjects = new Set<THREE.Object3D>();
    
    this.scene.traverse((object) => {
      // Skip if already processed (child of a floor-tagged group)
      if (processedObjects.has(object)) return;
      
      // Skip system objects (grid, ground plane, helpers)
      if (this.shouldSkipGhosting(object)) {
        processedObjects.add(object);
        return;
      }
      
      // Show roofs in full building view with ghosting opacity
      if (object.userData.isRoof || object.userData.isBatchedRoofTiles) {
        object.visible = true;
        // Align roof render order with assets/floors
        const roofLevel = object.userData.floorLevel ?? object.userData.floor ?? 0;
        object.renderOrder = roofLevel * 10;
        if (object instanceof THREE.Mesh) {
          this.setObjectOpacity(object, opacity);
        } else if (object instanceof THREE.InstancedMesh) {
          this.setInstancedMeshOpacity(object, opacity);
        }
        processedObjects.add(object);
        return;
      }
      
      // Handle InstancedMesh batches
      if (object instanceof THREE.InstancedMesh && object.userData.floorLevel !== undefined) {
        const floorLevel = object.userData.floorLevel as number;
        object.renderOrder = floorLevel * 10;
        this.setInstancedMeshOpacity(object, opacity);
        processedObjects.add(object);
        return;
      }
      
      if (object.userData.floor !== undefined) {
        const objectFloor = object.userData.floor as number;
        
        // Mark this object and all descendants as processed
        object.traverse(child => processedObjects.add(child));
        
        object.visible = true;
        object.renderOrder = objectFloor * 10;
        
        // Apply opacity to this object and all child meshes
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.renderOrder = objectFloor * 10;
            this.setObjectOpacity(child, opacity);
          }
        });
      }
    });
  }

  /**
   * Clear all ghosting (set all objects to full opacity)
   * Skips system objects like grid, lights, helpers, etc.
   */
  clearGhosting(): void {
    this.scene.traverse((object) => {
      // Skip non-meshes
      if (!(object instanceof THREE.Mesh)) return;
      
      // Skip system objects that should never have ghosting applied
      if (this.shouldSkipGhosting(object)) return;
      
      this.setObjectOpacity(object, 1.0);
    });
  }
  
  /**
   * Check if an object should be skipped during ghosting operations
   * This prevents breaking special materials like the grid's ShaderMaterial
   */
  private shouldSkipGhosting(object: THREE.Object3D): boolean {
    // Skip grid - it has a custom ShaderMaterial that shouldn't be modified
    if (object.userData.isGrid) return true;
    
    // Skip ground plane (shadow receiver) - check both naming conventions
    if (object.userData.isGroundPlane || object.userData.isGround) return true;
    
    // Skip any object explicitly marked to not receive ghosting
    if (object.userData.noGhosting) return true;
    
    // Skip lights (though they're not meshes, being defensive)
    if (object instanceof THREE.Light) return true;
    
    // Skip helpers
    if (object.userData.isHelper) return true;
    
    return false;
  }

  /**
   * Set opacity for an object with smooth animation
   * Uses proper blending settings for clean transparent rendering
   */
  private setObjectOpacity(mesh: THREE.Mesh, targetOpacity: number, animate: boolean = true): void {
    const ensureOwnMaterial = (mat: THREE.Material): THREE.Material => {
      // Clone the material if it's shared (userData.isCloned not set)
      // This prevents affecting other objects that share the same material
      if (!mat.userData.isClonedForGhosting) {
        const clonedMat = mat.clone();
        clonedMat.userData.isClonedForGhosting = true;
        return clonedMat;
      }
      return mat;
    };

    // Ensure we have our own material(s)
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(ensureOwnMaterial);
      mesh.material.forEach(mat => this.animateMaterialOpacity(mat, targetOpacity, animate));
    } else {
      mesh.material = ensureOwnMaterial(mesh.material);
      this.animateMaterialOpacity(mesh.material, targetOpacity, animate);
    }
  }
  
  /**
   * Animate a single material's opacity (ghost opacity, not effective opacity)
   * The actual effective opacity is calculated in applyOpacityToMaterial using baseOpacity
   */
  private animateMaterialOpacity(mat: THREE.Material, targetGhostOpacity: number, animate: boolean = true): void {
    // Get the base opacity and current ghost opacity
    const baseOpacity: number = mat.userData.baseOpacity ?? 1.0;
    const currentEffectiveOpacity = mat.opacity ?? 1.0;
    // Derive current ghost opacity from current effective opacity
    const currentGhostOpacity = baseOpacity > 0 ? currentEffectiveOpacity / baseOpacity : 1.0;
    
    // Calculate target effective opacity for comparison
    const targetEffectiveOpacity = baseOpacity * targetGhostOpacity;
    
    // If no change needed, skip
    if (Math.abs(currentEffectiveOpacity - targetEffectiveOpacity) < 0.01) {
      this.applyOpacityToMaterial(mat, targetGhostOpacity);
      return;
    }
    
    if (!animate) {
      // Apply immediately without animation
      this.applyOpacityToMaterial(mat, targetGhostOpacity);
      return;
    }
    
    // Start animation - animate the ghost opacity, not effective opacity
    this.activeAnimations.set(mat, {
      startOpacity: currentGhostOpacity,
      targetOpacity: targetGhostOpacity,
      startTime: performance.now(),
      duration: OPACITY_ANIMATION_DURATION,
    });
    
    // Start animation loop if not already running
    this.startAnimationLoop();
  }
  
  /**
   * Apply opacity value to a material (immediate, no animation)
   * 
   * Handles materials with natural transparency (e.g., glass):
   * - baseOpacity is stored in userData.baseOpacity for materials that are naturally transparent
   * - effectiveOpacity = baseOpacity * ghostOpacity
   * - This ensures that a 100% ghost opacity on a 35% transparent glass = 35% opacity
   *   and a 50% ghost opacity on 35% transparent glass = 17.5% opacity
   */
  private applyOpacityToMaterial(mat: THREE.Material, ghostOpacity: number): void {
    // Get the base opacity (natural transparency of the material)
    // Default to 1.0 for opaque materials
    const baseOpacity: number = mat.userData.baseOpacity ?? 1.0;
    const isNaturallyTransparent: boolean = mat.userData.isNaturallyTransparent ?? false;
    
    // Calculate effective opacity: baseOpacity * ghostOpacity
    // For naturally transparent materials, we scale their transparency with the ghost effect
    const effectiveOpacity = baseOpacity * ghostOpacity;
    
    // Determine if we need transparency rendering
    // A material is transparent if:
    // 1. It's naturally transparent (glass), OR
    // 2. The ghost opacity is less than 1.0
    const needsTransparency = isNaturallyTransparent || ghostOpacity < 1.0;
    
    mat.transparent = needsTransparency;
    mat.opacity = effectiveOpacity;
    mat.depthTest = true;
    
    // For transparent objects:
    // - depthWrite = false prevents z-fighting between transparent layers
    // - Combined with proper renderOrder (set per-floor), this gives clean results
    // For opaque objects:
    // - depthWrite = true for normal solid rendering
    mat.depthWrite = !needsTransparency;
    
    // Use normal alpha blending
    if (needsTransparency && mat instanceof THREE.MeshStandardMaterial) {
      mat.alphaTest = 0; // Don't discard pixels based on alpha
    }
    
    mat.needsUpdate = true;
  }
  
  /**
   * Start the opacity animation loop
   */
  private startAnimationLoop(): void {
    if (this.animationFrameId !== null) return; // Already running
    
    const tick = () => {
      const now = performance.now();
      let hasActiveAnimations = false;
      
      this.activeAnimations.forEach((anim, mat) => {
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / anim.duration, 1);
        
        // Use easeOutCubic for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate ghost opacity - applyOpacityToMaterial handles baseOpacity calculation
        const currentGhostOpacity = anim.startOpacity + (anim.targetOpacity - anim.startOpacity) * eased;
        this.applyOpacityToMaterial(mat, currentGhostOpacity);
        
        if (progress >= 1) {
          // Animation complete
          this.activeAnimations.delete(mat);
        } else {
          hasActiveAnimations = true;
        }
      });
      
      if (hasActiveAnimations) {
        this.animationFrameId = requestAnimationFrame(tick);
      } else {
        this.animationFrameId = null;
      }
    };
    
    this.animationFrameId = requestAnimationFrame(tick);
  }
  
  /**
   * Set opacity for an InstancedMesh (used for building batches)
   * Note: InstancedMesh materials are already cloned per-batch in BuildingManager
   */
  private setInstancedMeshOpacity(mesh: THREE.InstancedMesh, targetOpacity: number, animate: boolean = true): void {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => this.animateMaterialOpacity(mat, targetOpacity, animate));
    } else {
      this.animateMaterialOpacity(mesh.material, targetOpacity, animate);
    }
  }

  /**
   * Apply correct visibility and opacity to a single object based on its floor and current view mode
   * Call this after placing a new object to ensure it has the correct visibility
   */
  applyGhostingToObject(object: THREE.Object3D): void {
    // Skip system objects (grid, ground plane, helpers)
    if (this.shouldSkipGhosting(object)) return;
    
    const objectFloor = object.userData.floor as number | undefined;
    
    // Set render order based on floor level
    if (objectFloor !== undefined) {
      object.renderOrder = objectFloor * 10;
    }
    
    // If in full building view, use configurable full building view opacity
    if (this.isFullBuildingView) {
      const opacity = this.ghostingConfig.fullBuildingViewOpacity;
      object.visible = true;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.renderOrder = (objectFloor ?? 0) * 10;
          this.setObjectOpacity(child, opacity);
        }
      });
      return;
    }
    
    // Apply floor-based ghosting
    if (objectFloor === undefined) {
      // No floor info - make visible and opaque
      object.visible = true;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.setObjectOpacity(child, 1.0);
        }
      });
      return;
    }
    
    let opacity = 1.0;
    if (objectFloor === this.currentFloor) {
      opacity = 1.0;
    } else if (objectFloor > this.currentFloor) {
      opacity = this.ghostingConfig.floorsAboveOpacity;
    } else {
      opacity = this.ghostingConfig.floorsBelowOpacity;
    }
    
    object.visible = true;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = objectFloor * 10;
        this.setObjectOpacity(child, opacity);
      }
    });
  }

  /**
   * Get all objects on a specific floor
   */
  getObjectsOnFloor(level: number): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    
    this.scene.traverse((object) => {
      if (object.userData.floor === level) {
        objects.push(object);
      }
    });
    
    return objects;
  }

  /**
   * Register a floor level as available
   */
  registerFloor(level: number): void {
    this.availableFloors.add(level);
  }

  /**
   * Get all available floor levels (sorted)
   */
  getAvailableFloors(): number[] {
    return Array.from(this.availableFloors).sort((a, b) => a - b);
  }

  /**
   * Go to next floor (up)
   */
  goUp(): void {
    const floors = this.getAvailableFloors();
    const currentIndex = floors.indexOf(this.currentFloor);
    
    if (currentIndex < floors.length - 1) {
      this.setFloor(floors[currentIndex + 1]);
    }
  }

  /**
   * Go to previous floor (down)
   */
  goDown(): void {
    const floors = this.getAvailableFloors();
    const currentIndex = floors.indexOf(this.currentFloor);
    
    if (currentIndex > 0) {
      this.setFloor(floors[currentIndex - 1]);
    }
  }

  /**
   * Check if object is on current floor (or should be visible in full view)
   */
  isObjectVisible(object: THREE.Object3D): boolean {
    if (this.isFullBuildingView) {
      return true;
    }
    
    return object.userData.floor === this.currentFloor;
  }

  /**
   * Get floor label for display (B2, B1, G, 1, 2, 3, etc.)
   */
  getFloorLabel(level: number): string {
    if (level === 0) {
      return 'G';
    } else if (level < 0) {
      return `B${Math.abs(level)}`;
    } else {
      return level.toString();
    }
  }

  /**
   * Reset to ground floor
   */
  reset(): void {
    this.setFloor(0);
    this.setFullBuildingView(false);
  }

  /**
   * Clear all floor data
   */
  clear(): void {
    this.availableFloors.clear();
    this.availableFloors.add(0);
    this.currentFloor = 0;
    this.isFullBuildingView = false;
    this.clearGhosting();
  }

  /**
   * Remove a floor level from the available floors
   */
  unregisterFloor(level: number): void {
    this.availableFloors.delete(level);
    
    // If we removed the current floor, go to nearest valid floor
    if (this.currentFloor === level) {
      const floors = this.getAvailableFloors();
      if (floors.length > 0) {
        // Find the nearest floor
        let nearestFloor = floors[0];
        let minDist = Math.abs(level - floors[0]);
        
        for (const floor of floors) {
          const dist = Math.abs(level - floor);
          if (dist < minDist) {
            minDist = dist;
            nearestFloor = floor;
          }
        }
        
        this.setFloor(nearestFloor);
      }
    }
  }

  /**
   * Shift all floor registrations by an amount (used when inserting/deleting floors)
   * @param fromLevel - Only shift floors at or above this level
   * @param shiftAmount - Positive to shift up, negative to shift down
   */
  shiftFloors(fromLevel: number, shiftAmount: number): void {
    const floors = this.getAvailableFloors();
    const newFloors = new Set<number>();
    
    for (const floor of floors) {
      if (floor >= fromLevel) {
        newFloors.add(floor + shiftAmount);
      } else {
        newFloors.add(floor);
      }
    }
    
    this.availableFloors = newFloors;
    
    // Also adjust current floor if needed
    if (this.currentFloor >= fromLevel) {
      this.currentFloor += shiftAmount;
      this.callbacks.onFloorChanged(this.currentFloor);
    }
  }

  /**
   * Shift object floor userData in the scene
   * @param fromLevel - Only shift objects at or above this level
   * @param shiftAmount - Positive to shift up, negative to shift down
   * @returns Array of shifted object info
   */
  shiftObjectFloors(fromLevel: number, shiftAmount: number): { id: string; oldFloor: number; newFloor: number }[] {
    const shiftedObjects: { id: string; oldFloor: number; newFloor: number }[] = [];
    const gridSize = this.gridSystem.getGridSize();
    
    this.scene.traverse((object) => {
      if (object.userData.floor !== undefined && object.userData.id) {
        const objectFloor = object.userData.floor as number;
        
        if (objectFloor >= fromLevel) {
          const newFloor = objectFloor + shiftAmount;
          shiftedObjects.push({
            id: object.userData.id,
            oldFloor: objectFloor,
            newFloor: newFloor,
          });
          
          // Update the object's floor userData
          object.userData.floor = newFloor;
          
          // Update the object's Y position
          const newY = newFloor * FLOOR_HEIGHT * gridSize;
          object.position.y = newY;
        }
      }
    });
    
    return shiftedObjects;
  }

  /**
   * Get minimum floor level
   */
  getMinFloor(): number {
    const floors = this.getAvailableFloors();
    return floors.length > 0 ? Math.min(...floors) : 0;
  }

  /**
   * Get maximum floor level
   */
  getMaxFloor(): number {
    const floors = this.getAvailableFloors();
    return floors.length > 0 ? Math.max(...floors) : 0;
  }
}

