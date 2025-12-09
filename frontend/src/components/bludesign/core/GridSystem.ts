/**
 * Grid System
 * 
 * Creates and manages the infinite grid floor with fade effect,
 * and provides grid snapping functionality.
 */

import * as THREE from 'three';
import {
  GridConfig,
  DEFAULT_GRID_CONFIG,
  GridSize,
  GridPosition,
  AssetCategory,
} from './types';

// Layer types for tile occupancy
export type TileLayer = 'ground' | 'object';

// Tile occupancy data
export interface TileOccupancy {
  ground: string | null;  // Object ID of ground tile (grass, pavement, etc.)
  object: string | null;  // Object ID of object on top (units, walls, etc.)
}

// Check if category is a ground type
export function isGroundCategory(category: AssetCategory | string): boolean {
  return [
    AssetCategory.GRASS,
    AssetCategory.GRAVEL,
    AssetCategory.PAVEMENT,
    AssetCategory.FLOOR,
  ].includes(category as AssetCategory);
}

// Custom shader for infinite grid with fade
const gridVertexShader = `
  varying vec3 vWorldPosition;
  
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const gridFragmentShader = `
  uniform float uSize;
  uniform float uDivisions;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform float uFadeDistance;
  uniform float uOpacity;
  uniform vec3 uCameraPosition;
  uniform float uSecondaryOpacity; // Additional control for fine grid visibility
  
  varying vec3 vWorldPosition;
  
  float getGrid(float size, float thickness) {
    vec2 r = vWorldPosition.xz / size;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
  }
  
  void main() {
    // Distance from camera (horizontal only)
    float dist = length(vWorldPosition.xz - uCameraPosition.xz);
    
    // Improved fade factor - slower fade at top, more visible area
    // Start fading later (0.6 instead of 0.5) and extend the fade range
    float fadeStart = uFadeDistance * 0.6;
    float fadeEnd = uFadeDistance * 1.3;
    float fade = 1.0 - smoothstep(fadeStart, fadeEnd, dist);
    
    // Primary grid (large)
    float grid1 = getGrid(uSize / uDivisions * 10.0, 2.0);
    
    // Secondary grid (small)
    float grid2 = getGrid(uSize / uDivisions, 1.0);
    
    // Combine grids - increased fine grid visibility
    vec3 color = mix(uSecondaryColor, uPrimaryColor, grid1);
    // uSecondaryOpacity controls fine grid visibility (default 0.5, can be higher for dark theme)
    float alpha = max(grid1 * 0.8, grid2 * uSecondaryOpacity) * uOpacity * fade;
    
    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(color, alpha);
  }
`;

export class GridSystem {
  private scene: THREE.Scene;
  private gridMesh: THREE.Mesh | null = null;
  private gridMaterial: THREE.ShaderMaterial | null = null;
  private groundMesh: THREE.Mesh | null = null;
  private config: GridConfig;
  private currentGridSize: GridSize = GridSize.TINY;
  
  // Two-layer grid occupancy tracking (floor-aware)
  // Each cell can have a ground layer (grass, pavement, etc.) and an object layer (units, walls, etc.)
  // Key format: "x,z,floor" for floor-aware tracking
  private tileOccupancy: Map<string, TileOccupancy> = new Map();
  private objectMetadata: Map<string, { canStack: boolean; layer: TileLayer; category: AssetCategory | string; floor: number }> = new Map();
  
  // Helper to generate floor-aware cell key
  private getCellKey(x: number, z: number, floor: number = 0): string {
    return `${x},${z},${floor}`;
  }

  constructor(scene: THREE.Scene, config: GridConfig = DEFAULT_GRID_CONFIG) {
    this.scene = scene;
    this.config = config;
  }

  /**
   * Create the grid
   */
  create(): void {
    this.dispose();
    
    // Create a larger plane for the grid to prevent cutoff in isometric view
    const geometry = new THREE.PlaneGeometry(
      this.config.size * 3, // Increased from 2 to 3
      this.config.size * 3,
      1,
      1
    );
    geometry.rotateX(-Math.PI / 2);
    
    // Create shader material
    // Use higher secondary opacity for dark theme visibility
    const secondaryOpacity = this.config.secondaryOpacity ?? 0.5;
    
    this.gridMaterial = new THREE.ShaderMaterial({
      vertexShader: gridVertexShader,
      fragmentShader: gridFragmentShader,
      uniforms: {
        uSize: { value: this.config.size },
        uDivisions: { value: this.config.divisions },
        uPrimaryColor: { value: new THREE.Color(this.config.primaryColor) },
        uSecondaryColor: { value: new THREE.Color(this.config.secondaryColor) },
        uFadeDistance: { value: this.config.fadeDistance },
        uOpacity: { value: this.config.opacity },
        uCameraPosition: { value: new THREE.Vector3() },
        uSecondaryOpacity: { value: secondaryOpacity },
      },
      transparent: true,
      side: THREE.FrontSide, // Only render top face of grid
      depthWrite: false, // Grid doesn't write to depth - won't occlude objects below it
      depthTest: true,   // Grid tests depth - gets occluded by objects on/above it
    });
    
    this.gridMesh = new THREE.Mesh(geometry, this.gridMaterial);
    this.gridMesh.frustumCulled = false;
    this.gridMesh.renderOrder = -100; // Render first, before any floor objects (which start at renderOrder 0)
    this.gridMesh.userData.isGrid = true;
    this.gridMesh.userData.selectable = false;
    
    // Add a subtle ground plane for shadow receiving
    // This stays at y=0 always and doesn't move with floors
    const groundGeometry = new THREE.PlaneGeometry(this.config.size * 3, this.config.size * 3);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.ShadowMaterial({
      opacity: 0.3,
    });
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.position.y = -0.01; // Slightly below ground grid, never moves
    this.groundMesh.renderOrder = -99; // Render before grid to avoid artifacts
    this.groundMesh.receiveShadow = true;
    this.groundMesh.userData.isGround = true;
    this.groundMesh.userData.selectable = false;
    this.groundMesh.frustumCulled = false;
    
    this.scene.add(this.gridMesh);
    this.scene.add(this.groundMesh);
  }

  /**
   * Update grid (call in render loop)
   * Adjusts fade distance based on camera height for better visibility
   */
  update(camera: THREE.Camera): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uCameraPosition.value.copy(camera.position);
      
      // Adjust fade distance based on camera height (Y)
      // Higher camera = larger fade distance
      const baseHeight = 30; // Reference height
      const heightRatio = Math.max(0.7, Math.min(2.5, camera.position.y / baseHeight));
      const adjustedFadeDistance = this.config.fadeDistance * heightRatio;
      
      this.gridMaterial.uniforms.uFadeDistance.value = adjustedFadeDistance;
    }
  }

  /**
   * Set grid visibility
   */
  setVisible(visible: boolean): void {
    if (this.gridMesh) {
      this.gridMesh.visible = visible;
    }
    // Ground mesh visibility follows grid visibility
    if (this.groundMesh) {
      this.groundMesh.visible = visible;
    }
  }

  /**
   * Set grid Y position (for multi-floor support)
   * Grid is offset slightly below the actual floor level to prevent z-fighting
   * Note: groundMesh stays at y=-0.01 always (true ground plane for shadows)
   */
  setGridY(y: number): void {
    if (this.gridMesh) {
      // When y=0 (ground floor), grid should be at 0, not negative (to stay above ground mesh)
      // For upper floors, offset slightly below floor level
      this.gridMesh.position.y = y;
    }
    // Ground mesh stays at y=-0.01 always - don't move it
  }

  /**
   * Get current grid Y position
   */
  getGridY(): number {
    return this.gridMesh?.position.y ?? 0;
  }

  /**
   * Set grid size for snapping
   */
  setGridSize(size: GridSize): void {
    this.currentGridSize = size;
    
    if (this.gridMaterial) {
      // Update divisions based on grid size
      // Smaller grid size = more divisions visible
      const divisionsMultiplier = GridSize.TINY / size;
      this.gridMaterial.uniforms.uDivisions.value = this.config.divisions * divisionsMultiplier;
    }
  }

  /**
   * Get current grid size
   */
  getGridSize(): GridSize {
    return this.currentGridSize;
  }

  /**
   * Snap a world position to the grid
   */
  snapToGrid(position: THREE.Vector3): GridPosition {
    const size = this.currentGridSize;
    
    return {
      x: Math.round(position.x / size) * size,
      z: Math.round(position.z / size) * size,
      y: position.y,
    };
  }

  /**
   * Convert grid position to world position
   */
  gridToWorld(gridPos: GridPosition): THREE.Vector3 {
    const size = this.currentGridSize;
    return new THREE.Vector3(
      gridPos.x * size,
      gridPos.y ?? 0,
      gridPos.z * size
    );
  }

  /**
   * Convert world position to grid position
   */
  worldToGrid(worldPos: THREE.Vector3): GridPosition {
    const size = this.currentGridSize;
    return {
      x: Math.round(worldPos.x / size),
      z: Math.round(worldPos.z / size),
      y: worldPos.y,
    };
  }

  /**
   * Check if a position is valid on the grid
   */
  isValidPosition(gridPos: GridPosition, _objectSize: { x: number; z: number }): boolean {
    // Check bounds
    const halfSize = this.config.size / 2;
    const worldX = gridPos.x * this.currentGridSize;
    const worldZ = gridPos.z * this.currentGridSize;
    
    return (
      worldX >= -halfSize && worldX <= halfSize &&
      worldZ >= -halfSize && worldZ <= halfSize
    );
  }

  /**
   * Get grid cells occupied by an object
   */
  getOccupiedCells(
    position: GridPosition,
    size: { x: number; z: number },
    orientation: number
  ): GridPosition[] {
    const cells: GridPosition[] = [];
    
    // Swap dimensions if rotated 90 or 270 degrees
    const isRotated = orientation === 90 || orientation === 270;
    const sizeX = isRotated ? size.z : size.x;
    const sizeZ = isRotated ? size.x : size.z;
    
    for (let x = 0; x < sizeX; x++) {
      for (let z = 0; z < sizeZ; z++) {
        cells.push({
          x: position.x + x,
          z: position.z + z,
          y: position.y,
        });
      }
    }
    
    return cells;
  }

  /**
   * Update grid colors
   */
  setColors(primary: string, secondary: string): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uPrimaryColor.value.set(primary);
      this.gridMaterial.uniforms.uSecondaryColor.value.set(secondary);
    }
  }

  /**
   * Update fade distance
   */
  setFadeDistance(distance: number): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uFadeDistance.value = distance;
    }
  }

  /**
   * Update opacity
   */
  setOpacity(opacity: number): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uOpacity.value = opacity;
    }
  }

  /**
   * Update secondary grid opacity (fine lines)
   */
  setSecondaryOpacity(opacity: number): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uSecondaryOpacity.value = opacity;
    }
  }

  /**
   * Apply a full config update (for theme changes)
   */
  applyConfig(config: GridConfig): void {
    this.config = config;
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uPrimaryColor.value.set(config.primaryColor);
      this.gridMaterial.uniforms.uSecondaryColor.value.set(config.secondaryColor);
      this.gridMaterial.uniforms.uOpacity.value = config.opacity;
      this.gridMaterial.uniforms.uSecondaryOpacity.value = config.secondaryOpacity ?? 0.5;
      this.gridMaterial.uniforms.uFadeDistance.value = config.fadeDistance;
    }
  }

  /**
   * Determine which layer an asset should occupy
   */
  getLayerForCategory(category: AssetCategory | string): TileLayer {
    return isGroundCategory(category) ? 'ground' : 'object';
  }

  /**
   * Check if a grid position is occupied for the given layer (floor-aware)
   * Ground layer: Cannot place ground on ground (returns true if ground exists)
   * Object layer: Check if object exists, walls can stack with non-walls
   * @param gridPos Starting grid position
   * @param size Size in grid units
   * @param canStack Whether this object can stack (walls can overlap)
   * @param category Asset category to determine layer
   * @param floor Floor level to check (default 0)
   * @returns true if occupied (cannot place), false if available
   */
  isOccupied(
    gridPos: GridPosition, 
    size: { x: number; z: number }, 
    canStack: boolean, 
    category?: AssetCategory | string,
    floor: number = 0
  ): boolean {
    const layer = category ? this.getLayerForCategory(category) : 'object';
    
    // Check all cells this object would occupy on the specified floor
    for (let x = 0; x < size.x; x++) {
      for (let z = 0; z < size.z; z++) {
        const cellKey = this.getCellKey(gridPos.x + x, gridPos.z + z, floor);
        const tile = this.tileOccupancy.get(cellKey);
        
        if (!tile) continue;
        
        if (layer === 'ground') {
          // Ground on ground = replace, but we need to return true to trigger replacement logic
          // Actually, for isOccupied to signal "cannot place", we return true only if same layer occupied
          if (tile.ground) {
            // Ground exists - will be replaced, but that's handled separately
            // Return false to allow placement (which will trigger replacement)
            // Actually, return a special indicator - let's use a different check
            continue; // Ground can always be placed (replaces existing)
          }
        } else {
          // Object layer - check for conflicts
          if (tile.object) {
            const existingObj = this.objectMetadata.get(tile.object);
            if (!existingObj) continue;
            
            // If both are walls (both canStack), cannot place
            if (canStack && existingObj.canStack) {
              return true; // Both walls - invalid
            }
            
            // If neither can stack, cannot place
            if (!canStack && !existingObj.canStack) {
              return true; // Both solid objects - invalid
            }
            
            // Otherwise one is a wall and one isn't - can stack
          }
        }
      }
    }
    
    return false; // All cells are free or stackable
  }

  /**
   * Check if a grid position is occupied, excluding specified object IDs
   * Used for movement validation where the objects being moved should be excluded
   * @param gridPos Starting grid position
   * @param size Size in grid units
   * @param canStack Whether this object can stack (walls can overlap)
   * @param category Asset category to determine layer
   * @param floor Floor level to check
   * @param excludeIds Set of object IDs to exclude from collision check
   * @returns true if occupied (cannot place), false if available
   */
  isOccupiedExcluding(
    gridPos: GridPosition, 
    size: { x: number; z: number }, 
    canStack: boolean, 
    category: AssetCategory | string | undefined,
    floor: number,
    excludeIds: Set<string>
  ): boolean {
    const layer = category ? this.getLayerForCategory(category) : 'object';
    
    // Check all cells this object would occupy on the specified floor
    for (let x = 0; x < size.x; x++) {
      for (let z = 0; z < size.z; z++) {
        const cellKey = this.getCellKey(gridPos.x + x, gridPos.z + z, floor);
        const tile = this.tileOccupancy.get(cellKey);
        
        if (!tile) continue;
        
        if (layer === 'ground') {
          // Ground can always be placed (replaces existing)
          continue;
        } else {
          // Object layer - check for conflicts
          if (tile.object && !excludeIds.has(tile.object)) {
            const existingObj = this.objectMetadata.get(tile.object);
            if (!existingObj) continue;
            
            // If both are walls (both canStack), cannot place
            if (canStack && existingObj.canStack) {
              return true; // Both walls - invalid
            }
            
            // If neither can stack, cannot place
            if (!canStack && !existingObj.canStack) {
              return true; // Both solid objects - invalid
            }
            
            // Otherwise one is a wall and one isn't - can stack
          }
        }
      }
    }
    
    return false; // All cells are free or stackable (excluding the moving objects)
  }

  /**
   * Get existing ground at a position (for replacement logic)
   * @param gridPos Grid position
   * @param floor Floor level (default 0)
   */
  getGroundAt(gridPos: GridPosition, floor: number = 0): string | null {
    const cellKey = this.getCellKey(gridPos.x, gridPos.z, floor);
    const tile = this.tileOccupancy.get(cellKey);
    return tile?.ground ?? null;
  }

  /**
   * Mark cells as occupied by an object (floor-aware)
   * @param objectId Unique object ID
   * @param gridPos Starting grid position
   * @param size Size in grid units
   * @param canStack Whether this object can stack (walls)
   * @param category Asset category to determine layer
   * @param floor Floor level (default 0)
   * @returns Object ID of replaced ground (if any)
   */
  markOccupied(
    objectId: string, 
    gridPos: GridPosition, 
    size: { x: number; z: number }, 
    canStack: boolean = false,
    category?: AssetCategory | string,
    floor: number = 0
  ): string | null {
    const layer = category ? this.getLayerForCategory(category) : 'object';
    let replacedGroundId: string | null = null;
    
    // Store object metadata with floor information
    this.objectMetadata.set(objectId, { canStack, layer, category: category ?? 'unknown', floor });
    
    // Mark cells as occupied on the specified floor
    for (let x = 0; x < size.x; x++) {
      for (let z = 0; z < size.z; z++) {
        const cellKey = this.getCellKey(gridPos.x + x, gridPos.z + z, floor);
        
        // Get or create tile occupancy
        let tile = this.tileOccupancy.get(cellKey);
        if (!tile) {
          tile = { ground: null, object: null };
          this.tileOccupancy.set(cellKey, tile);
        }
        
        if (layer === 'ground') {
          // Replace existing ground if any
          if (tile.ground) {
            replacedGroundId = tile.ground;
          }
          tile.ground = objectId;
        } else {
          // Mark object layer
          tile.object = objectId;
        }
      }
    }
    
    return replacedGroundId;
  }

  /**
   * Clear occupied cells for an object (searches across all floors)
   */
  clearOccupied(objectId: string): void {
    const metadata = this.objectMetadata.get(objectId);
    if (!metadata) {
      // Fallback to searching all tiles (across all floors)
      for (const [key, tile] of this.tileOccupancy.entries()) {
        if (tile.ground === objectId) {
          tile.ground = null;
        }
        if (tile.object === objectId) {
          tile.object = null;
        }
        // Clean up empty tiles
        if (!tile.ground && !tile.object) {
          this.tileOccupancy.delete(key);
        }
      }
      return;
    }
    
    const layer = metadata.layer;
    
    // Remove from all tiles on the appropriate layer (across all floors since we search by objectId)
    for (const [key, tile] of this.tileOccupancy.entries()) {
      if (layer === 'ground' && tile.ground === objectId) {
        tile.ground = null;
      } else if (layer === 'object' && tile.object === objectId) {
        tile.object = null;
      }
      
      // Clean up empty tiles
      if (!tile.ground && !tile.object) {
        this.tileOccupancy.delete(key);
      }
    }
    
    // Remove metadata
    this.objectMetadata.delete(objectId);
  }

  /**
   * Clear all occupancy data
   */
  clearAllOccupancy(): void {
    this.tileOccupancy.clear();
    this.objectMetadata.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.gridMesh) {
      this.scene.remove(this.gridMesh);
      this.gridMesh.geometry.dispose();
      this.gridMesh = null;
    }
    
    if (this.gridMaterial) {
      this.gridMaterial.dispose();
      this.gridMaterial = null;
    }
    
    // Remove ground plane mesh
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
      if (this.groundMesh.material) {
        (this.groundMesh.material as THREE.Material).dispose();
      }
      this.groundMesh = null;
    }
    
    // Clear occupancy
    this.clearAllOccupancy();
  }
}

