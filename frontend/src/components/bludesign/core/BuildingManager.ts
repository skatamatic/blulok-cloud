/**
 * Building Manager
 * 
 * Manages building creation, merging, wall generation, and building-related operations.
 * 
 * Performance Optimization:
 * - Uses THREE.InstancedMesh to batch render floor tiles and walls
 * - Dramatically reduces draw calls for large buildings
 * - Creates lightweight invisible "marker" objects for raycasting/selection
 */

import * as THREE from 'three';
import {
  Building,
  BuildingFootprint,
  Floor,
  BuildingWall,
  WallOpening,
  GridPosition,
  FLOOR_HEIGHT,
  AssetMetadata,
  BuildingSkinType,
} from './types';
import { GridSystem } from './GridSystem';
import { AssetFactory } from '../assets/AssetFactory';
import { getBuildingSkinManager } from './BuildingSkinManager';
import { BuildingMaterials } from './types';
import {
  GeometryOptimizer,
  OptimizationResult,
} from './utils/GeometryOptimizer';

export interface BuildingManagerCallbacks {
  onBuildingCreated: (building: Building) => void;
  onBuildingsMerged: (oldIds: string[], newBuilding: Building) => void;
  onBuildingDeleted: (buildingId: string) => void;
  onBuildingModified: (building: Building) => void;
  onWallCreated: (wall: BuildingWall, mesh: THREE.Object3D) => void;
  onFloorTileCreated: (floorTileId: string, mesh: THREE.Object3D) => void;
}

/** Represents a single cell in a building */
export interface BuildingCell {
  x: number;
  z: number;
}

/** Instance data for tracking batched meshes */
// interface FloorTileInstance {
//   id: string;
//   buildingId: string;
//   floorLevel: number;
//   gridX: number;
//   gridZ: number;
//   instanceIndex: number;
// }

// interface WallInstance {
//   id: string;
//   buildingId: string;
//   floorLevel: number;
//   instanceIndex: number;
//   orientation: 'north-south' | 'east-west';
// }

/** Batch of instanced meshes */
interface InstanceBatch {
  mesh: THREE.InstancedMesh;
  instances: Map<string, { instanceIndex: number }>;
  freeIndices: number[];
  maxCount: number;
}

export class BuildingManager {
  private scene: THREE.Scene;
  private gridSystem: GridSystem;
  private callbacks: BuildingManagerCallbacks;
  
  private buildings: Map<string, Building> = new Map();
  private wallMeshes: Map<string, THREE.Object3D> = new Map();
  private floorTileMeshes: Map<string, THREE.Object3D> = new Map();
  private roofTileMeshes: Map<string, THREE.Object3D> = new Map(); // Individual roof tile markers
  private roofTileIds: Map<string, string[]> = new Map(); // buildingId -> array of roof tile IDs
  
  // Cell-based tracking: maps "x,z" to buildingId for quick lookups
  private cellToBuildingMap: Map<string, string> = new Map();
  
  // Callback to remove ground tiles when building is placed
  private onRemoveGroundTiles: ((cells: Array<{x: number, z: number}>) => void) | null = null;
  
  // Instanced rendering batches
  private floorTileBatches: Map<number, InstanceBatch> = new Map(); // floorLevel -> batch
  private wallBatches: Map<string, InstanceBatch> = new Map(); // "floorLevel-orientation" -> batch
  private roofTileBatch: InstanceBatch | null = null; // Single batch for all roof tiles
  
  // Shared geometries and materials for instancing
  private sharedFloorGeometry: THREE.PlaneGeometry | null = null;
  private sharedFloorMaterial: THREE.MeshStandardMaterial | null = null;
  private sharedWallGeometry: THREE.BoxGeometry | null = null;
  private sharedWallMaterial: THREE.MeshStandardMaterial | null = null;
  private sharedRoofGeometry: THREE.PlaneGeometry | null = null;
  private sharedRoofMaterial: THREE.MeshStandardMaterial | null = null;
  
  // Temp objects for matrix calculations
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3(1, 1, 1);
  private textureLoader = new THREE.TextureLoader();
  private textureCache: Map<string, THREE.Texture> = new Map();
  
  // Enable/disable instanced rendering
  private useInstancing: boolean = true;
  
  // Geometry optimizer state
  private optimizerEnabled: boolean = true;
  private isReadonly: boolean = false;
  private floorOptimizations: Map<number, OptimizationResult> = new Map();
  private roofOptimizations: Map<string, OptimizationResult> = new Map();
  private frustumCullingEnabled: boolean = true;
  
  // Glass mullion meshes (vertical dividers for glass theme)
  private glassMullions: Set<THREE.Object3D> = new Set();
  private isGlassThemeActive: boolean = false;

  constructor(
    scene: THREE.Scene,
    gridSystem: GridSystem,
    _assetFactory: typeof AssetFactory,
    callbacks: BuildingManagerCallbacks
  ) {
    this.scene = scene;
    this.gridSystem = gridSystem;
    this.callbacks = callbacks;
    
    // Initialize shared geometries and materials
    this.initializeSharedResources();
  }
  
  /**
   * Initialize shared geometries and materials for instanced rendering
   */
  private initializeSharedResources(): void {
    const gridSize = this.gridSystem.getGridSize();
    
    // Floor tile geometry (flat plane)
    this.sharedFloorGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
    this.sharedFloorGeometry.rotateX(-Math.PI / 2);
    
    this.sharedFloorMaterial = new THREE.MeshStandardMaterial({
      color: 0x909090,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    
    // Wall geometry (1x1x1 box, scaled per instance)
    this.sharedWallGeometry = new THREE.BoxGeometry(1, 1, 1);
    
    this.sharedWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.8,
      metalness: 0.1,
    });
    
    // Roof tile geometry (flat plane, same as floor but different material)
    this.sharedRoofGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
    this.sharedRoofGeometry.rotateX(-Math.PI / 2);
    
    this.sharedRoofMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666, // Darker than walls for roof
      roughness: 0.7,
      metalness: 0.2,
      side: THREE.DoubleSide,
      transparent: true, // Allow ghosting
    });
  }
  
  /**
   * Set callback to remove ground tiles when building is placed
   */
  setOnRemoveGroundTiles(callback: (cells: Array<{x: number, z: number}>) => void): void {
    this.onRemoveGroundTiles = callback;
  }

  /**
   * Create a new building from a footprint
   */
  createBuilding(footprint: BuildingFootprint, name?: string): Building {
    const building: Building = {
      id: `building-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name || `Building ${this.buildings.size + 1}`,
      footprints: [footprint],
      floors: [
        {
          level: 0,
          height: FLOOR_HEIGHT,
          groundTileIds: [],
        },
      ],
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.buildings.set(building.id, building);
    
    // Register cells in the lookup map
    this.registerBuildingCells(building);

    // Generate walls, floor, and roof for the building
    this.regenerateWallsForBuilding(building);
    this.generateFloorTiles(building, 0);
    this.generateRoof(building);

    this.callbacks.onBuildingCreated(building);

    return building;
  }

  /**
   * Restore a building from saved data (used when loading from draft/file).
   * This properly restores a merged building with all its footprints at once,
   * generating walls only for the outer perimeter.
   */
  restoreBuilding(
    id: string,
    footprints: BuildingFootprint[],
    floors: { level: number; height: number }[],
    name?: string
  ): Building {
    // Ensure we have at least floor 0
    const normalizedFloors = floors.length > 0 ? floors : [{ level: 0, height: FLOOR_HEIGHT }];
    
    const building: Building = {
      id,
      name: name || `Building ${this.buildings.size + 1}`,
      footprints: [...footprints],
      floors: normalizedFloors.map(f => ({
        level: f.level,
        height: f.height,
        groundTileIds: [],
      })),
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.buildings.set(building.id, building);
    
    // Register cells in the lookup map
    this.registerBuildingCells(building);

    // Generate walls, floor tiles for ALL floors, and roof
    building.floors.forEach(floor => {
      this.regenerateWallsForBuilding(building, floor.level);
      this.generateFloorTiles(building, floor.level);
    });
    this.generateRoof(building);

    this.callbacks.onBuildingCreated(building);

    return building;
  }

  // ==========================================================================
  // Cell Management
  // ==========================================================================

  /**
   * Register all cells of a building in the lookup map
   */
  private registerBuildingCells(building: Building): void {
    building.footprints.forEach(fp => {
      for (let x = fp.minX; x <= fp.maxX; x++) {
        for (let z = fp.minZ; z <= fp.maxZ; z++) {
          this.cellToBuildingMap.set(`${x},${z}`, building.id);
        }
      }
    });
  }

  /**
   * Unregister all cells of a building from the lookup map
   */
  private unregisterBuildingCells(building: Building): void {
    building.footprints.forEach(fp => {
      for (let x = fp.minX; x <= fp.maxX; x++) {
        for (let z = fp.minZ; z <= fp.maxZ; z++) {
          this.cellToBuildingMap.delete(`${x},${z}`);
        }
      }
    });
  }

  /**
   * Get all cells that belong to a building as a Set of "x,z" strings
   */
  getBuildingCells(buildingId: string): Set<string> {
    const building = this.buildings.get(buildingId);
    if (!building) return new Set();
    
    const cells = new Set<string>();
    building.footprints.forEach(fp => {
      for (let x = fp.minX; x <= fp.maxX; x++) {
        for (let z = fp.minZ; z <= fp.maxZ; z++) {
          cells.add(`${x},${z}`);
        }
      }
    });
    return cells;
  }

  /**
   * Get building ID from a cell coordinate
   */
  getBuildingAtCell(x: number, z: number): string | null {
    return this.cellToBuildingMap.get(`${x},${z}`) || null;
  }

  /**
   * Get building from a mesh (wall or floor tile)
   */
  getBuildingFromMesh(mesh: THREE.Object3D): Building | null {
    const buildingId = mesh.userData.buildingId;
    if (!buildingId) return null;
    return this.buildings.get(buildingId) || null;
  }

  /**
   * Get all mesh IDs (walls and floor tiles) for a building
   */
  getBuildingMeshIds(buildingId: string): string[] {
    const building = this.buildings.get(buildingId);
    if (!building) return [];
    
    const ids: string[] = [];
    
    // Add wall IDs
    building.walls.forEach(wall => ids.push(wall.id));
    
    // Add floor tile IDs
    building.floors.forEach(floor => {
      floor.groundTileIds.forEach(tileId => ids.push(tileId));
    });
    
    return ids;
  }

  /**
   * Get all selectable mesh IDs for a building (floor tiles only, not walls)
   * Used for building selection - walls are not individually selectable
   */
  getBuildingSelectableMeshIds(buildingId: string): string[] {
    const building = this.buildings.get(buildingId);
    if (!building) return [];
    
    const ids: string[] = [];
    
    // Only add floor tile IDs (walls are not selectable)
    building.floors.forEach(floor => {
      floor.groundTileIds.forEach(tileId => ids.push(tileId));
    });
    
    return ids;
  }

  /**
   * Get all wall IDs for a building
   * Used for visual selection highlighting
   */
  getBuildingWallIds(buildingId: string): string[] {
    const building = this.buildings.get(buildingId);
    if (!building) return [];
    
    const ids: string[] = [];
    building.walls.forEach(wall => ids.push(wall.id));
    
    return ids;
  }

  // ==========================================================================
  // Building Deletion
  // ==========================================================================

  /**
   * Delete an entire building and all its meshes
   * Returns the deleted building for undo purposes
   * Handles both instanced and non-instanced rendering
   */
  deleteBuilding(buildingId: string): Building | null {
    const building = this.buildings.get(buildingId);
    if (!building) return null;
    
    // Unregister cells from lookup map
    this.unregisterBuildingCells(building);
    
    // Remove all wall meshes and free instances
    building.walls.forEach(wall => {
      const mesh = this.wallMeshes.get(wall.id);
      if (mesh) {
        this.scene.remove(mesh);
        
        // If using instancing, free the instance from the batch
        if (mesh.userData.isInstanceMarker) {
          const batchKey = mesh.userData.batchKey;
          const batch = this.wallBatches.get(batchKey);
          if (batch) {
            this.freeInstance(batch, wall.id);
          }
          // Dispose hitbox geometry
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => m.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        } else if (mesh instanceof THREE.Mesh) {
          // Non-instanced fallback
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
        this.wallMeshes.delete(wall.id);
      }
    });
    
    // Remove all floor tiles and free instances
    building.floors.forEach(floor => {
      floor.groundTileIds.forEach(tileId => {
        this.removeFloorTileInstance(tileId, floor.level);
      });
    });
    
    // Remove roof mesh
    this.removeRoof(buildingId);
    
    // Invalidate optimizations for this building
    this.invalidateOptimizations(buildingId);
    
    // Remove from buildings map
    this.buildings.delete(buildingId);
    
    // Notify
    this.callbacks.onBuildingDeleted(buildingId);
    
    return building;
  }

  /**
   * Rename a building
   */
  renameBuilding(buildingId: string, newName: string): boolean {
    const building = this.buildings.get(buildingId);
    if (!building) return false;
    
    building.name = newName;
    building.updatedAt = new Date();
    
    // Notify
    this.callbacks.onBuildingModified(building);
    
    return true;
  }

  /**
   * Remove specific cells from a building
   * This will recalculate walls and may split the building if disconnected
   * Returns info about the modification for undo purposes
   */
  removeCellsFromBuilding(
    buildingId: string,
    cellsToRemove: BuildingCell[]
  ): { modified: boolean; newFootprints: BuildingFootprint[]; removedCells: BuildingCell[] } | null {
    const building = this.buildings.get(buildingId);
    if (!building) return null;
    
    // Get current cells
    const currentCells = this.getBuildingCells(buildingId);
    const removedCells: BuildingCell[] = [];
    
    // Remove the specified cells
    cellsToRemove.forEach(cell => {
      const key = `${cell.x},${cell.z}`;
      if (currentCells.has(key)) {
        currentCells.delete(key);
        this.cellToBuildingMap.delete(key);
        removedCells.push(cell);
      }
    });
    
    if (removedCells.length === 0) {
      return { modified: false, newFootprints: building.footprints, removedCells: [] };
    }
    
    // If no cells remain, delete the building entirely
    if (currentCells.size === 0) {
      this.deleteBuilding(buildingId);
      return { modified: true, newFootprints: [], removedCells };
    }
    
    // Convert remaining cells back to footprints
    const newFootprints = this.cellsToFootprints(currentCells);
    
    // Update building footprints
    building.footprints = newFootprints;
    
    // Re-register cells
    this.registerBuildingCells(building);
    
    // Regenerate walls and floor tiles for all floors
    building.floors.forEach(floor => {
      this.regenerateWallsForBuilding(building, floor.level);
      this.generateFloorTiles(building, floor.level);
    });
    
    building.updatedAt = new Date();
    
    // Notify
    this.callbacks.onBuildingModified(building);
    
    return { modified: true, newFootprints, removedCells };
  }

  /**
   * Convert a set of cells into optimized footprints
   * Uses a simple greedy algorithm to create rectangular regions
   */
  private cellsToFootprints(cells: Set<string>): BuildingFootprint[] {
    if (cells.size === 0) return [];
    
    const remaining = new Set(cells);
    const footprints: BuildingFootprint[] = [];
    
    while (remaining.size > 0) {
      // Get any remaining cell as a starting point
      const firstKey = remaining.values().next().value;
      if (!firstKey) break; // Safety check
      const [startX, startZ] = firstKey.split(',').map(Number);
      
      // Expand to find the largest rectangle starting from this cell
      let minX = startX, maxX = startX;
      let minZ = startZ, maxZ = startZ;
      
      // Expand in +X direction
      while (remaining.has(`${maxX + 1},${startZ}`)) maxX++;
      
      // Expand in +Z direction (checking full row)
      let canExpandZ = true;
      while (canExpandZ) {
        for (let x = minX; x <= maxX; x++) {
          if (!remaining.has(`${x},${maxZ + 1}`)) {
            canExpandZ = false;
            break;
          }
        }
        if (canExpandZ) maxZ++;
      }
      
      // Expand in -X direction (checking full column)
      let canExpandMinX = true;
      while (canExpandMinX) {
        for (let z = minZ; z <= maxZ; z++) {
          if (!remaining.has(`${minX - 1},${z}`)) {
            canExpandMinX = false;
            break;
          }
        }
        if (canExpandMinX) minX--;
      }
      
      // Expand in -Z direction (checking full row)
      let canExpandMinZ = true;
      while (canExpandMinZ) {
        for (let x = minX; x <= maxX; x++) {
          if (!remaining.has(`${x},${minZ - 1}`)) {
            canExpandMinZ = false;
            break;
          }
        }
        if (canExpandMinZ) minZ--;
      }
      
      // Remove all cells in this rectangle from remaining
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          remaining.delete(`${x},${z}`);
        }
      }
      
      footprints.push({ minX, maxX, minZ, maxZ });
    }
    
    return footprints;
  }

  /**
   * Add cells to a building (for undo of cell removal)
   */
  addCellsToBuilding(buildingId: string, cells: BuildingCell[]): boolean {
    const building = this.buildings.get(buildingId);
    if (!building) return false;
    
    // Get current cells and add new ones
    const currentCells = this.getBuildingCells(buildingId);
    cells.forEach(cell => {
      currentCells.add(`${cell.x},${cell.z}`);
      this.cellToBuildingMap.set(`${cell.x},${cell.z}`, buildingId);
    });
    
    // Convert to footprints
    building.footprints = this.cellsToFootprints(currentCells);
    
    // Regenerate
    building.floors.forEach(floor => {
      this.regenerateWallsForBuilding(building, floor.level);
      this.generateFloorTiles(building, floor.level);
    });
    
    building.updatedAt = new Date();
    this.callbacks.onBuildingModified(building);
    
    return true;
  }

  /**
   * Check if a footprint overlaps with existing buildings
   * Returns the building IDs that overlap
   */
  findOverlappingBuildings(footprint: BuildingFootprint): string[] {
    const overlapping: string[] = [];

    for (const [id, building] of this.buildings) {
      for (const existingFootprint of building.footprints) {
        if (this.footprintsOverlap(footprint, existingFootprint)) {
          overlapping.push(id);
          break;
        }
      }
    }

    return overlapping;
  }

  /**
   * Check if two footprints overlap
   */
  private footprintsOverlap(a: BuildingFootprint, b: BuildingFootprint): boolean {
    return !(
      a.maxX < b.minX ||
      a.minX > b.maxX ||
      a.maxZ < b.minZ ||
      a.minZ > b.maxZ
    );
  }

  /**
   * Merge multiple buildings into one
   */
  mergeBuildings(buildingIds: string[]): Building {
    if (buildingIds.length === 0) {
      throw new Error('No buildings to merge');
    }

    if (buildingIds.length === 1) {
      return this.buildings.get(buildingIds[0])!;
    }

    // Get all buildings to merge
    const buildingsToMerge = buildingIds
      .map(id => this.buildings.get(id))
      .filter(b => b !== undefined) as Building[];

    if (buildingsToMerge.length === 0) {
      throw new Error('No valid buildings found');
    }

    // Merge all footprints
    const allFootprints: BuildingFootprint[] = [];
    const allFloorLevels = new Set<number>();
    
    buildingsToMerge.forEach(building => {
      allFootprints.push(...building.footprints);
      building.floors.forEach(floor => allFloorLevels.add(floor.level));
    });

    // Create merged building
    const mergedBuilding: Building = {
      id: `building-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Merged ${buildingsToMerge[0].name}`,
      footprints: allFootprints,
      floors: Array.from(allFloorLevels).sort((a, b) => a - b).map(level => ({
        level,
        height: FLOOR_HEIGHT,
        groundTileIds: [],
      })),
      walls: [],
      interiorWalls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Remove old buildings (including their cell registrations)
    buildingsToMerge.forEach(building => {
      this.unregisterBuildingCells(building);
      this.removeBuilding(building.id);
    });

    // Add merged building
    this.buildings.set(mergedBuilding.id, mergedBuilding);

    // Register cells for merged building
    this.registerBuildingCells(mergedBuilding);
    
    // Regenerate walls, floors, and roof for merged building
    console.log(`[BuildingManager] mergeBuildings: Regenerating walls, floors, and roof for merged building ${mergedBuilding.id}`);
    console.log(`[BuildingManager] mergeBuildings: Merged footprints count = ${mergedBuilding.footprints.length}`);
    
    mergedBuilding.floors.forEach(floor => {
      this.regenerateWallsForBuilding(mergedBuilding, floor.level);
      this.generateFloorTiles(mergedBuilding, floor.level);
    });
    this.generateRoof(mergedBuilding);

    this.callbacks.onBuildingsMerged(buildingIds, mergedBuilding);

    return mergedBuilding;
  }

  /**
   * Remove a building and all its meshes
   */
  private removeBuilding(buildingId: string): void {
    const building = this.buildings.get(buildingId);
    if (!building) return;

    // Remove all wall meshes and free instances
    building.walls.forEach(wall => {
      const mesh = this.wallMeshes.get(wall.id);
      if (mesh) {
        this.scene.remove(mesh);
        
        // If using instancing, free the instance
        if (mesh.userData.isInstanceMarker) {
          const batchKey = mesh.userData.batchKey;
          const batch = this.wallBatches.get(batchKey);
          if (batch) {
            this.freeInstance(batch, wall.id);
          }
          // Dispose hitbox
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => m.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        } else if (mesh instanceof THREE.Mesh) {
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
        this.wallMeshes.delete(wall.id);
      }
    });

    // Remove all floor tiles and free instances
    building.floors.forEach(floor => {
      floor.groundTileIds.forEach(tileId => {
        this.removeFloorTileInstance(tileId, floor.level);
      });
    });

    // Remove roof mesh if exists
    this.removeRoof(buildingId);

    this.buildings.delete(buildingId);
  }

  /**
   * Regenerate walls for a building at a specific floor level
   */
  regenerateWallsForBuilding(building: Building, floorLevel: number = 0): void {
    console.log(`[BuildingManager] regenerateWallsForBuilding: building=${building.id}, floor=${floorLevel}, footprints=${building.footprints.length}`);
    
    // Remove existing wall meshes for this floor from scene
    const wallsToRemove = building.walls.filter(w => w.floorLevel === floorLevel);
    console.log(`[BuildingManager] Removing ${wallsToRemove.length} existing walls for floor ${floorLevel}`);
    
    wallsToRemove.forEach(wall => {
      const mesh = this.wallMeshes.get(wall.id);
      if (mesh) {
        this.scene.remove(mesh);
        
        // If using instancing, free the instance from the batch
        if (mesh.userData.isInstanceMarker) {
          const batchKey = mesh.userData.batchKey;
          const batch = this.wallBatches.get(batchKey);
          if (batch) {
            this.freeInstance(batch, wall.id);
          }
          // Dispose hitbox geometry
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => m.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        } else if (mesh instanceof THREE.Mesh) {
          // Non-instanced fallback
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
        this.wallMeshes.delete(wall.id);
      }
    });
    
    // Remove wall data for this floor
    building.walls = building.walls.filter(w => w.floorLevel !== floorLevel);

    // Calculate the union perimeter of all footprints
    console.log(`[BuildingManager] Footprints:`, building.footprints);
    const perimeterSegments = this.calculatePerimeter(building.footprints);
    console.log(`[BuildingManager] Got ${perimeterSegments.length} perimeter segments`);

    // Create walls for each perimeter segment
    perimeterSegments.forEach((segment) => {
      const wall: BuildingWall = {
        id: `wall-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        buildingId: building.id,
        startPos: segment.start,
        endPos: segment.end,
        floorLevel,
        isExterior: true,
        openings: [],
      };

      building.walls.push(wall);

      // Create wall mesh
      this.createWallMesh(wall);
    });
    
    console.log(`[BuildingManager] Created ${building.walls.filter(w => w.floorLevel === floorLevel).length} walls for floor ${floorLevel}`);
  }

  /**
   * Calculate the perimeter of merged footprints
   * Returns array of wall segments that form the outer perimeter only (no interior walls)
   */
  private calculatePerimeter(footprints: BuildingFootprint[]): Array<{ start: GridPosition; end: GridPosition }> {
    if (footprints.length === 0) return [];
    
    // Create a grid to mark which cells are inside ANY footprint
    const grid = new Set<string>();
    
    footprints.forEach(fp => {
      for (let x = fp.minX; x <= fp.maxX; x++) {
        for (let z = fp.minZ; z <= fp.maxZ; z++) {
          grid.add(`${x},${z}`);
        }
      }
    });
    
    console.log(`[BuildingManager] calculatePerimeter: ${footprints.length} footprints, ${grid.size} total cells`);
    
    // Find all edge segments by checking each building cell's 4 neighbors
    // Use a simpler approach: for each cell, check if each neighbor is outside the building
    const horizontalEdges: Array<{ x: number; z: number; length: 1 }> = [];
    const verticalEdges: Array<{ x: number; z: number; length: 1 }> = [];
    
    grid.forEach(key => {
      const parts = key.split(',');
      const x = parseInt(parts[0], 10);
      const z = parseInt(parts[1], 10);
      
      // North: if no building at (x, z+1), create wall at top of this cell
      if (!grid.has(`${x},${z + 1}`)) {
        horizontalEdges.push({ x, z: z + 1, length: 1 });
      }
      
      // South: if no building at (x, z-1), create wall at bottom of this cell
      if (!grid.has(`${x},${z - 1}`)) {
        horizontalEdges.push({ x, z, length: 1 });
      }
      
      // East: if no building at (x+1, z), create wall at right of this cell
      if (!grid.has(`${x + 1},${z}`)) {
        verticalEdges.push({ x: x + 1, z, length: 1 });
      }
      
      // West: if no building at (x-1, z), create wall at left of this cell
      if (!grid.has(`${x - 1},${z}`)) {
        verticalEdges.push({ x, z, length: 1 });
      }
    });
    
    console.log(`[BuildingManager] Found ${horizontalEdges.length} H edges, ${verticalEdges.length} V edges`);
    
    // Convert to segments - each edge segment goes from corner to corner of a cell
    const segments: Array<{ start: GridPosition; end: GridPosition }> = [];
    
    // Horizontal edges: from (x, z) to (x+1, z)
    horizontalEdges.forEach(edge => {
      segments.push({
        start: { x: edge.x, z: edge.z, y: 0 },
        end: { x: edge.x + 1, z: edge.z, y: 0 },
      });
    });
    
    // Vertical edges: from (x, z) to (x, z+1)
    verticalEdges.forEach(edge => {
      segments.push({
        start: { x: edge.x, z: edge.z, y: 0 },
        end: { x: edge.x, z: edge.z + 1, y: 0 },
      });
    });
    
    console.log(`[BuildingManager] Created ${segments.length} wall segments (1 grid unit each)`);
    
    // DO NOT merge segments - keep them as individual grid cells for precise window/door placement
    // This allows hiding individual wall segments when windows/doors are placed
    
    return segments;
  }
  

  /**
   * Create a wall mesh
   */
  private createWallMesh(wall: BuildingWall): void {
    const gridSize = this.gridSystem.getGridSize();
    const startWorld = this.gridSystem.gridToWorld(wall.startPos);
    const endWorld = this.gridSystem.gridToWorld(wall.endPos);

    // Calculate wall dimensions
    const length = Math.sqrt(
      Math.pow(endWorld.x - startWorld.x, 2) +
      Math.pow(endWorld.z - startWorld.z, 2)
    );
    const height = FLOOR_HEIGHT * gridSize;
    const thickness = 0.2;

    // Calculate wall position and rotation
    const centerX = (startWorld.x + endWorld.x) / 2;
    const centerZ = (startWorld.z + endWorld.z) / 2;
    const angle = Math.atan2(endWorld.z - startWorld.z, endWorld.x - startWorld.x);
    
    // Determine wall orientation
    const deltaX = Math.abs(endWorld.x - startWorld.x);
    const deltaZ = Math.abs(endWorld.z - startWorld.z);
    const orientation = (deltaX > deltaZ) ? 'east-west' : 'north-south';

    if (this.useInstancing && this.sharedWallGeometry && this.sharedWallMaterial) {
      // Use instanced rendering
      const batch = this.getOrCreateWallBatch(wall.floorLevel, orientation);
      const instanceIndex = this.allocateInstance(batch);
      
      // Set instance transform
      this.tempPosition.set(
        centerX,
        (wall.floorLevel * FLOOR_HEIGHT * gridSize) + height / 2,
        centerZ
      );
      this.tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      this.tempScale.set(length, height, thickness);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
      batch.mesh.instanceMatrix.needsUpdate = true;
      
      // Track instance
      batch.instances.set(wall.id, { instanceIndex });
      
      // Create invisible marker for raycasting/selection
      const marker = new THREE.Object3D();
      marker.position.set(centerX, (wall.floorLevel * FLOOR_HEIGHT * gridSize) + height / 2, centerZ);
      marker.rotation.y = angle;
      marker.userData.isBuildingWall = true;
      marker.userData.wallId = wall.id;
      marker.userData.buildingId = wall.buildingId;
      marker.userData.floor = wall.floorLevel;
      marker.userData.id = wall.id;
      marker.userData.selectable = true;
      marker.userData.isWall = true;
      marker.userData.wallOrientation = orientation;
      marker.userData.isInstanceMarker = true;
      marker.userData.instanceIndex = instanceIndex;
      marker.userData.batchKey = `${wall.floorLevel}-${orientation}`;
      
      // Add a small invisible box for raycasting
      const hitboxGeometry = new THREE.BoxGeometry(length, height, thickness);
      const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
      marker.add(hitbox);
      
      this.scene.add(marker);
      wall.meshId = marker.uuid;
      this.wallMeshes.set(wall.id, marker);
      
      this.callbacks.onWallCreated(wall, marker);
    } else {
      // Fallback to individual meshes (original behavior)
      const geometry = new THREE.BoxGeometry(length, height, thickness);
      const material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.8,
        metalness: 0.1,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(centerX, (wall.floorLevel * FLOOR_HEIGHT * gridSize) + height / 2, centerZ);
      mesh.rotation.y = angle;
      mesh.userData.isBuildingWall = true;
      mesh.userData.wallId = wall.id;
      mesh.userData.buildingId = wall.buildingId;
      mesh.userData.floor = wall.floorLevel;
      mesh.userData.id = wall.id;
      mesh.userData.selectable = true;
      mesh.userData.isWall = true;
      mesh.userData.wallOrientation = orientation;
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      this.scene.add(mesh);
      wall.meshId = mesh.uuid;
      
      this.wallMeshes.set(wall.id, mesh);

      this.callbacks.onWallCreated(wall, mesh);
    }
  }
  
  /**
   * Get or create an instanced mesh batch for walls
   */
  private getOrCreateWallBatch(floorLevel: number, orientation: string): InstanceBatch {
    const key = `${floorLevel}-${orientation}`;
    let batch = this.wallBatches.get(key);
    
    if (!batch && this.sharedWallGeometry && this.sharedWallMaterial) {
      const capacity = 500;
      const mesh = new THREE.InstancedMesh(
        this.sharedWallGeometry,
        this.sharedWallMaterial.clone(), // Clone material for per-floor opacity control
        capacity
      );
      mesh.name = `walls-${key}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.isBatchedWalls = true;
      mesh.userData.floorLevel = floorLevel;
      mesh.userData.orientation = orientation;
      
      this.scene.add(mesh);
      
      batch = {
        mesh,
        instances: new Map(),
        freeIndices: [],
        maxCount: capacity,
      };
      this.wallBatches.set(key, batch);
    }
    
    return batch!;
  }

  /**
   * Generate floor tiles for a building at a specific floor level
   * Also notifies to remove any existing ground tiles (grass, pavement, etc.) in the building area
   * Deduplicates overlapping cells from merged buildings to prevent duplicate tiles
   */
  private generateFloorTiles(building: Building, floorLevel: number): void {
    const floor = building.floors.find(f => f.level === floorLevel);
    if (!floor) return;

    // Clear existing floor tiles
    floor.groundTileIds.forEach(tileId => {
      this.removeFloorTileInstance(tileId, floorLevel);
    });
    floor.groundTileIds = [];
    
    // Collect all UNIQUE cells from all footprints (prevent duplicates from merged buildings)
    const uniqueCells = new Set<string>();
    const cellList: Array<{x: number, z: number}> = [];
    
      building.footprints.forEach(footprint => {
        for (let x = footprint.minX; x <= footprint.maxX; x++) {
          for (let z = footprint.minZ; z <= footprint.maxZ; z++) {
          const cellKey = `${x},${z}`;
          if (!uniqueCells.has(cellKey)) {
            uniqueCells.add(cellKey);
            cellList.push({ x, z });
          }
          }
        }
      });
    
    // Notify to remove ground tiles (only on ground floor)
    if (floorLevel === 0 && this.onRemoveGroundTiles && cellList.length > 0) {
      this.onRemoveGroundTiles(cellList);
    }

    // Always rebuild optimization when building changes (invalidate cache)
    // This ensures optimizations are up-to-date when footprints change
    let optimization: OptimizationResult | undefined = undefined;
    if (this.optimizerEnabled) {
      optimization = this.rebuildFloorOptimization(building, floorLevel) || undefined;
    }
    
    // Use optimized rectangles if available and instancing is enabled
    if (optimization && this.useInstancing && this.sharedFloorGeometry && this.sharedFloorMaterial) {
      this.createOptimizedFloorTiles(building, floorLevel, optimization);
    } else {
      // Fallback to per-cell rendering (existing logic)
      this.createPerCellFloorTiles(building, floorLevel, cellList);
    }
    
    // ALWAYS create individual markers for selection (regardless of optimization)
    this.createFloorTileMarkers(building, floorLevel, cellList);
  }

  /**
   * Generate or update the roof mesh for a building using instanced 1x1 tiles
   * Roof sits on top of the highest floor and is only visible in Full View mode
   * Tiles match exact footprint cells (not bounding box)
   * Deduplicates overlapping cells from merged buildings
   */
  generateRoof(building: Building): void {
    console.log(`[BuildingManager] generateRoof called for building ${building.id}, footprints: ${building.footprints.length}`);
    
    // Remove existing roof tiles if any
    this.removeRoof(building.id);
    
    if (building.floors.length === 0 || building.footprints.length === 0) {
      console.log(`[BuildingManager] generateRoof: No floors or footprints, skipping`);
      return;
    }
    
    // Find the highest floor level
    const maxFloorLevel = Math.max(...building.floors.map(f => f.level));
    const gridSize = this.gridSystem.getGridSize();
    // Add 0.01 Y offset to prevent z-fighting
    const roofY = (maxFloorLevel + 1) * FLOOR_HEIGHT * gridSize + 0.01;
    // Align roof render order with assets/floors
    const roofRenderOrder = (maxFloorLevel + 1) * 10;
    
    const roofTileIds: string[] = [];
    
    // Collect all UNIQUE cells from all footprints (prevent duplicates from merged buildings)
    const uniqueCells = new Set<string>();
    const cellList: Array<{x: number, z: number}> = [];
    
    building.footprints.forEach(footprint => {
      for (let x = footprint.minX; x <= footprint.maxX; x++) {
        for (let z = footprint.minZ; z <= footprint.maxZ; z++) {
          const cellKey = `${x},${z}`;
          if (!uniqueCells.has(cellKey)) {
            uniqueCells.add(cellKey);
            cellList.push({ x, z });
          }
        }
      }
    });
    
    // Get or rebuild optimization
    let optimization: OptimizationResult | undefined = this.roofOptimizations.get(building.id);
    if (!optimization && this.optimizerEnabled) {
      optimization = this.rebuildRoofOptimization(building) || undefined;
    }
    
    // Use optimized rectangles if available and instancing is enabled
    if (optimization && this.useInstancing && this.sharedRoofGeometry && this.sharedRoofMaterial) {
      this.createOptimizedRoofTiles(building, maxFloorLevel, roofY, roofRenderOrder, optimization, roofTileIds);
    } else {
      // Fallback to per-cell rendering
      this.createPerCellRoofTiles(building, maxFloorLevel, roofY, roofRenderOrder, cellList, roofTileIds);
    }
    
    // ALWAYS create individual markers for identification (regardless of optimization)
    this.createRoofTileMarkers(building, maxFloorLevel, roofY, cellList, roofTileIds);
    
    // Store roof tile IDs for this building
    this.roofTileIds.set(building.id, roofTileIds);
    building.roofMeshId = `roof-${building.id}`;
    
    // Initially hide roof tiles (only visible in Full View mode)
    this.setRoofVisible(building.id, false, 1.0);
    
    const tileCount = roofTileIds.length;
    console.log(`[BuildingManager] generateRoof complete: ${tileCount} tiles, roofY=${roofY}`);
  }
  
  /**
   * Get or create the instanced mesh batch for roof tiles
   */
  private getOrCreateRoofTileBatch(): InstanceBatch {
    if (!this.roofTileBatch && this.sharedRoofGeometry && this.sharedRoofMaterial) {
      const capacity = 2000; // Support large buildings
      const mesh = new THREE.InstancedMesh(
        this.sharedRoofGeometry,
        this.sharedRoofMaterial.clone(),
        capacity
      );
      mesh.name = 'roof-tiles';
      mesh.count = 0;
      mesh.frustumCulled = this.frustumCullingEnabled;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData.isBatchedRoofTiles = true;
      mesh.userData.isRoof = true;
      mesh.visible = false; // Initially hidden
      
      this.scene.add(mesh);
      
      this.roofTileBatch = {
        mesh,
        instances: new Map(),
        freeIndices: [],
        maxCount: capacity,
      };
    }
    
    return this.roofTileBatch!;
  }

  /**
   * Load or get cached texture
   */
  private getTexture(url: string): THREE.Texture {
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url)!;
    }
    const tex = this.textureLoader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.textureCache.set(url, tex);
    return tex;
  }
  
  /**
   * Set visibility and opacity for a building's roof
   */
  setRoofVisible(buildingId: string, visible: boolean, opacity: number = 1.0): void {
    const tileIds = this.roofTileIds.get(buildingId);
    if (!tileIds) return;
    
    // Update instanced batch visibility and opacity
    if (this.roofTileBatch) {
      this.roofTileBatch.mesh.visible = visible;
      if (this.roofTileBatch.mesh.material instanceof THREE.MeshStandardMaterial) {
        this.roofTileBatch.mesh.material.opacity = opacity;
        this.roofTileBatch.mesh.material.transparent = opacity < 1.0;
        this.roofTileBatch.mesh.material.needsUpdate = true;
      }
    }
    
    // Update individual markers/meshes
    for (const tileId of tileIds) {
      const marker = this.roofTileMeshes.get(tileId);
      if (marker) {
        marker.visible = visible;
        if (marker instanceof THREE.Mesh && marker.material instanceof THREE.MeshStandardMaterial) {
          marker.material.opacity = opacity;
          marker.material.transparent = opacity < 1.0;
          marker.material.needsUpdate = true;
        }
      }
    }
  }
  
  /**
   * Remove the roof tiles for a building
   */
  removeRoof(buildingId: string): void {
    const tileIds = this.roofTileIds.get(buildingId);
    if (tileIds) {
      for (const tileId of tileIds) {
        const marker = this.roofTileMeshes.get(tileId);
        if (marker) {
          this.scene.remove(marker);
          
          // If using instancing, free the instance
          if (marker.userData.isInstanceMarker && this.roofTileBatch) {
            this.freeInstance(this.roofTileBatch, tileId);
          }
          
          // Dispose geometry/material if it's a mesh
          if (marker instanceof THREE.Mesh) {
            marker.geometry.dispose();
            if (marker.material instanceof THREE.Material) {
              marker.material.dispose();
            }
          }
          
          this.roofTileMeshes.delete(tileId);
        }
      }
      this.roofTileIds.delete(buildingId);
    }
    
    const building = this.buildings.get(buildingId);
    if (building) {
      building.roofMeshId = undefined;
    }
  }
  
  /**
   * Set roof visibility for all buildings (for floor mode vs full building view)
   * @param visible Whether roofs should be visible
   * @param opacity Opacity level (for ghosting in full view mode)
   */
  setRoofsVisible(visible: boolean, opacity: number = 1.0): void {
    // Update the instanced batch
    if (this.roofTileBatch) {
      this.roofTileBatch.mesh.visible = visible;
      if (this.roofTileBatch.mesh.material instanceof THREE.MeshStandardMaterial) {
        this.roofTileBatch.mesh.material.opacity = opacity;
        this.roofTileBatch.mesh.material.transparent = opacity < 1.0;
        this.roofTileBatch.mesh.material.needsUpdate = true;
      }
    }
    
    // Update individual markers/meshes (fallback mode)
    for (const marker of this.roofTileMeshes.values()) {
      marker.visible = visible;
      if (marker instanceof THREE.Mesh && marker.material instanceof THREE.MeshStandardMaterial) {
        marker.material.opacity = opacity;
        marker.material.transparent = opacity < 1.0;
        marker.material.needsUpdate = true;
      }
    }
  }
  
  /**
   * Check if a building has a roof
   */
  hasRoof(buildingId: string): boolean {
    return this.roofTileIds.has(buildingId) && (this.roofTileIds.get(buildingId)?.length ?? 0) > 0;
  }
  
  /**
   * Get or create an instanced mesh batch for floor tiles
   */
  private getOrCreateFloorTileBatch(floorLevel: number): InstanceBatch {
    let batch = this.floorTileBatches.get(floorLevel);
    
    if (!batch && this.sharedFloorGeometry && this.sharedFloorMaterial) {
      const capacity = 1000;
      const mesh = new THREE.InstancedMesh(
        this.sharedFloorGeometry,
        this.sharedFloorMaterial.clone(), // Clone material for per-floor opacity control
        capacity
      );
      mesh.name = `floor-tiles-${floorLevel}`;
      mesh.count = 0;
      mesh.frustumCulled = this.frustumCullingEnabled;
      mesh.receiveShadow = true;
      mesh.userData.isBatchedFloorTiles = true;
      mesh.userData.floorLevel = floorLevel;
      
      this.scene.add(mesh);
      
      batch = {
        mesh,
        instances: new Map(),
        freeIndices: [],
        maxCount: capacity,
      };
      this.floorTileBatches.set(floorLevel, batch);
    }
    
    return batch!;
  }
  
  /**
   * Allocate an instance index from a batch
   */
  private allocateInstance(batch: InstanceBatch): number {
    let index: number;
    
    if (batch.freeIndices.length > 0) {
      index = batch.freeIndices.pop()!;
    } else {
      index = batch.mesh.count;
      batch.mesh.count++;
      
      // Check if we need to grow
      if (batch.mesh.count >= batch.maxCount) {
        this.growBatch(batch);
      }
    }
    
    return index;
  }
  
  /**
   * Free an instance for reuse
   */
  private freeInstance(batch: InstanceBatch, id: string): void {
    const instance = batch.instances.get(id);
    if (!instance) return;
    
    // Move instance to "infinity" (far away) so it's not rendered
    this.tempMatrix.makeTranslation(99999, 99999, 99999);
    batch.mesh.setMatrixAt(instance.instanceIndex, this.tempMatrix);
    batch.mesh.instanceMatrix.needsUpdate = true;
    
    // Add index to free list
    batch.freeIndices.push(instance.instanceIndex);
    batch.instances.delete(id);
  }
  
  /**
   * Grow a batch when it runs out of capacity
   */
  private growBatch(batch: InstanceBatch): void {
    const newCapacity = batch.maxCount * 2;
    const geometry = batch.mesh.geometry;
    const material = batch.mesh.material;
    
    const newMesh = new THREE.InstancedMesh(geometry, material, newCapacity);
    newMesh.name = batch.mesh.name;
    newMesh.count = batch.mesh.count;
    newMesh.frustumCulled = false;
    
    // Copy existing matrices
    for (let i = 0; i < batch.mesh.count; i++) {
      batch.mesh.getMatrixAt(i, this.tempMatrix);
      newMesh.setMatrixAt(i, this.tempMatrix);
    }
    newMesh.instanceMatrix.needsUpdate = true;
    
    // Copy properties
    newMesh.userData = { ...batch.mesh.userData };
    newMesh.castShadow = batch.mesh.castShadow;
    newMesh.receiveShadow = batch.mesh.receiveShadow;
    
    // Replace in scene
    this.scene.remove(batch.mesh);
    batch.mesh.dispose();
    this.scene.add(newMesh);
    
    batch.mesh = newMesh;
    batch.maxCount = newCapacity;
    
    console.log(`[BuildingManager] Grew batch ${newMesh.name} to ${newCapacity} capacity`);
  }
  
  /**
   * Remove a floor tile instance
   */
  private removeFloorTileInstance(tileId: string, floorLevel: number): void {
    const mesh = this.floorTileMeshes.get(tileId);
    if (mesh) {
      this.scene.remove(mesh);
      
      // If it's a marker with hitbox, dispose the hitbox
      if (mesh.userData.isInstanceMarker) {
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else if (child.material) {
              child.material.dispose();
            }
          }
        });
      } else if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
      this.floorTileMeshes.delete(tileId);
    }
    
    // Free from instance batch
    const batch = this.floorTileBatches.get(floorLevel);
    if (batch) {
      this.freeInstance(batch, tileId);
    }
  }

  /**
   * Add a floor to a building (above or below)
   */
  addFloor(buildingId: string, level: number): Floor {
    const building = this.buildings.get(buildingId);
    if (!building) {
      throw new Error(`Building ${buildingId} not found`);
    }

    // Check if floor already exists
    const existingFloor = building.floors.find(f => f.level === level);
    if (existingFloor) {
      return existingFloor;
    }

    // Create new floor
    const newFloor: Floor = {
      level,
      height: FLOOR_HEIGHT,
      groundTileIds: [],
    };

    building.floors.push(newFloor);
    building.floors.sort((a, b) => a.level - b.level);

    // Extend walls to this floor
    this.regenerateWallsForBuilding(building, level);
    this.generateFloorTiles(building, level);
    
    // Regenerate roof to sit on top of the new highest floor
    this.generateRoof(building);

    building.updatedAt = new Date();

    return newFloor;
  }

  /**
   * Remove a floor from a building
   * @returns The removed floor or null if not found
   */
  removeFloor(buildingId: string, level: number): Floor | null {
    const building = this.buildings.get(buildingId);
    if (!building) {
      console.error(`Building ${buildingId} not found`);
      return null;
    }

    // Find and remove the floor
    const floorIndex = building.floors.findIndex(f => f.level === level);
    if (floorIndex === -1) {
      console.warn(`Floor ${level} not found in building ${buildingId}`);
      return null;
    }

    const removedFloor = building.floors.splice(floorIndex, 1)[0];

    // Remove walls at this floor level
    const wallsToRemove = building.walls.filter(w => w.floorLevel === level);
    wallsToRemove.forEach(wall => {
      const mesh = this.wallMeshes.get(wall.id);
      if (mesh) {
        this.scene.remove(mesh);
        
        // If using instancing, free the instance from the batch
        if (mesh.userData.isInstanceMarker) {
          const batchKey = mesh.userData.batchKey;
          const batch = this.wallBatches.get(batchKey);
          if (batch) {
            this.freeInstance(batch, wall.id);
          }
          // Dispose hitbox geometry
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => m.dispose());
                } else {
                  child.material.dispose();
                }
              }
            }
          });
        } else if (mesh instanceof THREE.Mesh) {
          // Non-instanced fallback
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
        this.wallMeshes.delete(wall.id);
      }
    });

    building.walls = building.walls.filter(w => w.floorLevel !== level);

    // Remove floor tiles at this level
    removedFloor.groundTileIds.forEach(tileId => {
      this.removeFloorTileInstance(tileId, level);
    });

    // Regenerate roof to sit on top of the new highest floor
    this.generateRoof(building);
    
    building.updatedAt = new Date();

    return removedFloor;
  }

  /**
   * Shift floor levels in a building (used when inserting/deleting floors)
   * @param fromLevel - Only shift floors at or above this level
   * @param shiftAmount - Positive to shift up, negative to shift down
   */
  shiftFloorLevels(buildingId: string, fromLevel: number, shiftAmount: number): void {
    const building = this.buildings.get(buildingId);
    if (!building) return;

    const gridSize = this.gridSystem.getGridSize();

    // Shift floor levels
    building.floors.forEach(floor => {
      if (floor.level >= fromLevel) {
        floor.level += shiftAmount;
      }
    });

    // Re-sort floors after shifting
    building.floors.sort((a, b) => a.level - b.level);

    // Shift wall levels and positions
    building.walls.forEach(wall => {
      if (wall.floorLevel >= fromLevel) {
        // const oldLevel = wall.floorLevel;
        wall.floorLevel += shiftAmount;

        // Update wall mesh position
        const mesh = this.wallMeshes.get(wall.id);
        if (mesh) {
          const yDiff = shiftAmount * FLOOR_HEIGHT * gridSize;
          mesh.position.y += yDiff;
          mesh.userData.floor = wall.floorLevel;
        }
      }
    });

    // Shift floor tile positions
    building.floors.forEach(floor => {
      floor.groundTileIds.forEach(tileId => {
        const mesh = this.floorTileMeshes.get(tileId);
        if (mesh && mesh.userData.floor !== undefined) {
          const oldFloor = mesh.userData.floor;
          if (oldFloor >= fromLevel - shiftAmount) {
            mesh.userData.floor = oldFloor + shiftAmount;
            const yDiff = shiftAmount * FLOOR_HEIGHT * gridSize;
            mesh.position.y += yDiff;
          }
        }
      });
    });

    building.updatedAt = new Date();
  }

  /**
   * Get a floor by level
   */
  getFloor(buildingId: string, level: number): Floor | undefined {
    const building = this.buildings.get(buildingId);
    if (!building) return undefined;
    return building.floors.find(f => f.level === level);
  }

  /**
   * Get all perimeter walls for a building at a specific floor
   */
  getPerimeterWalls(buildingId: string, floorLevel: number): BuildingWall[] {
    const building = this.buildings.get(buildingId);
    if (!building) return [];

    return building.walls.filter(
      w => w.buildingId === buildingId && w.floorLevel === floorLevel && w.isExterior
    );
  }

  /**
   * Check if an asset can be placed on a wall
   */
  canPlaceOnWall(asset: AssetMetadata, wall: BuildingWall, position: number): boolean {
    // Check if asset is wall-mountable
    const wallMountableCategories = ['door', 'window', 'storage_unit', 'elevator'];
    if (!wallMountableCategories.includes(asset.category)) {
      return false;
    }

    // Check if there's space (no other openings at this position)
    const assetWidth = Math.max(asset.gridUnits.x, asset.gridUnits.z);
    const tolerance = 0.1;

    for (const opening of wall.openings) {
      const distance = Math.abs(opening.position - position);
      if (distance < (opening.width + assetWidth) / 2 + tolerance) {
        return false; // Too close to another opening
      }
    }

    return true;
  }

  /**
   * Remove an opening from a wall
   * Restores the wall segment that was hidden
   */
  removeWallOpening(wallId: string, openingId: string): void {
    for (const building of this.buildings.values()) {
      const wall = building.walls.find(w => w.id === wallId);
      if (wall) {
        // Remove the opening
        const index = wall.openings.findIndex(o => o.id === openingId);
        if (index >= 0) {
          const opening = wall.openings[index];
          wall.openings.splice(index, 1);
          
          // Restore wall visibility if it was a window
          if (opening.type === 'window') {
            // Find and restore hidden wall segments
            const wallMesh = this.wallMeshes.get(wallId);
            if (wallMesh) {
              wallMesh.visible = true;
            }
          }
        }
      }
    }
  }

  /**
   * Add an opening to a wall (door or window)
   * Hides the wall segment where the window/door is placed
   */
  addWallOpening(wallId: string, opening: WallOpening): void {
    for (const building of this.buildings.values()) {
      const wall = building.walls.find(w => w.id === wallId);
      if (wall) {
        // Record the opening
        if (!wall.openings.some(o => o.id === opening.id)) {
        wall.openings.push(opening);
        }
        // Doors should not remove wall segments
        if (opening.type === 'door') {
        break;
      }
        
        // WINDOWS: hide the affected wall segments based on opening width
        const gridSize = this.gridSystem.getGridSize();
        const deltaX = Math.abs(wall.endPos.x - wall.startPos.x);
        const deltaZ = Math.abs(wall.endPos.z - wall.startPos.z);
        const orientation = (deltaX > deltaZ) ? 'east-west' : 'north-south';

        // Compute target center for the current wall
        const startWorld = this.gridSystem.gridToWorld(wall.startPos);
        const endWorld = this.gridSystem.gridToWorld(wall.endPos);
        const targetCenterX = (startWorld.x + endWorld.x) / 2;
        const targetCenterZ = (startWorld.z + endWorld.z) / 2;

        // Span in world units to hide
        const span = Math.max(1, opening.width) * gridSize;
        const halfSpan = span / 2 + gridSize * 0.05; // small tolerance

        // Collect candidate walls on same building, floor, and orientation
        const candidateWalls = building.walls.filter(w => {
          const dx = Math.abs(w.endPos.x - w.startPos.x);
          const dz = Math.abs(w.endPos.z - w.startPos.z);
          const orient = (dx > dz) ? 'east-west' : 'north-south';
          if (orient !== orientation) return false;
          if (w.floorLevel !== wall.floorLevel) return false;
          return true;
        });

        const wallsToHide = candidateWalls.filter(w => {
          const sw = this.gridSystem.gridToWorld(w.startPos);
          const ew = this.gridSystem.gridToWorld(w.endPos);
          const cx = (sw.x + ew.x) / 2;
          const cz = (sw.z + ew.z) / 2;
          if (orientation === 'east-west') {
            return Math.abs(cx - targetCenterX) <= halfSpan && Math.abs(cz - targetCenterZ) < gridSize * 0.2;
          } else {
            return Math.abs(cz - targetCenterZ) <= halfSpan && Math.abs(cx - targetCenterX) < gridSize * 0.2;
          }
        });

        if (this.useInstancing) {
          const batchKey = `${wall.floorLevel}-${orientation}`;
          const batch = this.wallBatches.get(batchKey);
          if (batch) {
            const height = FLOOR_HEIGHT * gridSize;
            const baseY = wall.floorLevel * FLOOR_HEIGHT * gridSize;
            const angle = Math.atan2(endWorld.z - startWorld.z, endWorld.x - startWorld.x);
            for (const w of wallsToHide) {
              const inst = batch.instances.get(w.id);
              if (!inst) continue;
              const sw = this.gridSystem.gridToWorld(w.startPos);
              const ew = this.gridSystem.gridToWorld(w.endPos);
              const cx = (sw.x + ew.x) / 2;
              const cz = (sw.z + ew.z) / 2;
              this.tempPosition.set(cx, baseY + height / 2, cz);
              this.tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
              this.tempScale.set(0.001, 0.001, 0.001);
              this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
              batch.mesh.setMatrixAt(inst.instanceIndex, this.tempMatrix);
            }
            batch.mesh.instanceMatrix.needsUpdate = true;
          }
        } else {
          for (const w of wallsToHide) {
            const wallMesh = this.wallMeshes.get(w.id);
            if (wallMesh) {
              wallMesh.visible = false;
            }
          }
        }

        break;
      }
    }
  }


  

  /**
   * Get all buildings
   */
  getAllBuildings(): Building[] {
    return Array.from(this.buildings.values());
  }

  /**
   * Get a building by ID
   */
  getBuilding(id: string): Building | undefined {
    return this.buildings.get(id);
  }

  /**
   * Set the skin type for a building
   */
  setBuildingSkin(buildingId: string, skinType: BuildingSkinType | string): void {
    const building = this.buildings.get(buildingId);
    if (!building) return;
    
    building.skinType = skinType as BuildingSkinType;
    building.updatedAt = new Date();
    
    // Apply the new skin materials
    this.applyBuildingSkin(building);
    
    // Notify of modification
    this.callbacks.onBuildingModified(building);
  }

  /**
   * Apply building skin materials to all walls, floors, and roof
   */
  private applyBuildingSkin(building: Building): void {
    const skinManager = getBuildingSkinManager();
    const skinId = building.skinType || BuildingSkinType.DEFAULT;
    
    // Get the skin definition
    const skin = skinManager.getSkin(skinId);
    if (!skin) return;
    
    // Apply to wall batches
    this.wallBatches.forEach((batch, key) => {
      // Only update walls for this building's floors
      const floorLevel = parseInt(key.split('-')[0], 10);
      const hasThisBuilding = building.floors.some(f => f.level === floorLevel);
      
      if (hasThisBuilding) {
        const newMaterial = skinManager.createWallMaterial(skinId);
        if (batch.mesh.material !== newMaterial) {
          // Dispose old material if it was created specifically for this
          if (batch.mesh.material instanceof THREE.Material) {
            batch.mesh.material.dispose();
          }
          batch.mesh.material = newMaterial;
        }
      }
    });
    
    // Apply to floor batches
    this.floorTileBatches.forEach((batch, floorLevel) => {
      const hasThisBuilding = building.floors.some(f => f.level === floorLevel);
      
      if (hasThisBuilding) {
        const newMaterial = skinManager.createFloorMaterial(skinId);
        if (batch.mesh.material !== newMaterial) {
          if (batch.mesh.material instanceof THREE.Material) {
            batch.mesh.material.dispose();
          }
          batch.mesh.material = newMaterial;
        }
      }
    });
    
    // Apply to roof batch
    if (this.roofTileBatch) {
      const newMaterial = skinManager.createRoofMaterial(skinId);
      if (this.roofTileBatch.mesh.material !== newMaterial) {
        if (this.roofTileBatch.mesh.material instanceof THREE.Material) {
          this.roofTileBatch.mesh.material.dispose();
        }
        this.roofTileBatch.mesh.material = newMaterial;
      }
    }
  }

  /**
   * Get the current skin type for a building
   */
  getBuildingSkin(buildingId: string): BuildingSkinType | string | undefined {
    const building = this.buildings.get(buildingId);
    return building?.skinType;
  }

  /**
   * Translate a building by a delta amount
   * Updates footprints, regenerates walls and floor tiles
   * Returns list of placed object IDs that were inside the building
   */
  translateBuilding(buildingId: string, deltaX: number, deltaZ: number): string[] {
    const building = this.buildings.get(buildingId);
    if (!building) return [];
    
    // Unregister old cell positions
    this.unregisterBuildingCells(building);
    
    // Update all footprints
    building.footprints.forEach(fp => {
      fp.minX += deltaX;
      fp.maxX += deltaX;
      fp.minZ += deltaZ;
      fp.maxZ += deltaZ;
    });
    
    // Register new cell positions
    this.registerBuildingCells(building);
    
    // Regenerate walls and floor tiles for all floors
    building.floors.forEach(floor => {
      this.regenerateWallsForBuilding(building, floor.level);
      this.generateFloorTiles(building, floor.level);
    });
    
    // Regenerate roof at new position
    this.generateRoof(building);
    
    building.updatedAt = new Date();
    
    // Notify
    this.callbacks.onBuildingModified(building);
    
    // Return empty array (caller should find objects inside building cells)
    return [];
  }

  /**
   * Check if a position is inside any building
   */
  isInsideBuilding(position: GridPosition): string | null {
    for (const [id, building] of this.buildings) {
      for (const footprint of building.footprints) {
        if (
          position.x >= footprint.minX &&
          position.x <= footprint.maxX &&
          position.z >= footprint.minZ &&
          position.z <= footprint.maxZ
        ) {
          return id;
        }
      }
    }
    return null;
  }

  /**
   * Find a wall segment adjacent to a grid position
   * Returns wall info including orientation for automatic door alignment
   */
  findWallAtPosition(
    gridPos: GridPosition, 
    floorLevel: number
  ): { wall: BuildingWall; orientation: 'north' | 'south' | 'east' | 'west'; mesh: THREE.Object3D } | null {
    const gridSize = this.gridSystem.getGridSize();
    const worldX = gridPos.x * gridSize + gridSize / 2; // Center of grid cell
    const worldZ = gridPos.z * gridSize + gridSize / 2;
    
    let closestWall: { 
      wall: BuildingWall; 
      orientation: 'north' | 'south' | 'east' | 'west'; 
      mesh: THREE.Object3D;
      distance: number;
    } | null = null;
    
    for (const building of this.buildings.values()) {
      const walls = building.walls.filter(w => w.floorLevel === floorLevel);
      
      for (const wall of walls) {
        const mesh = this.wallMeshes.get(wall.id);
        if (!mesh) continue;
        
        const startWorld = this.gridSystem.gridToWorld(wall.startPos);
        const endWorld = this.gridSystem.gridToWorld(wall.endPos);
        
        // Calculate wall direction and center
        const wallDx = endWorld.x - startWorld.x;
        const wallDz = endWorld.z - startWorld.z;
        const wallLength = Math.sqrt(wallDx * wallDx + wallDz * wallDz);
        
        if (wallLength === 0) continue;
        
        // Determine if wall is horizontal (east-west) or vertical (north-south)
        const isHorizontal = Math.abs(wallDx) > Math.abs(wallDz);
        
        // Project point onto wall line to find nearest point on wall
        const t = Math.max(0, Math.min(1, (
          (worldX - startWorld.x) * wallDx + 
          (worldZ - startWorld.z) * wallDz
        ) / (wallLength * wallLength)));
        
        const nearestX = startWorld.x + t * wallDx;
        const nearestZ = startWorld.z + t * wallDz;
        
        // Calculate distance from grid center to nearest point on wall
        const distance = Math.sqrt(
          Math.pow(worldX - nearestX, 2) + 
          Math.pow(worldZ - nearestZ, 2)
        );
        
        // Check if this position is close enough to the wall (within 1.5 grid units)
        const maxDistance = gridSize * 1.5;
        
        if (distance <= maxDistance) {
          // Determine which side of the wall we're on to set door orientation
          let doorOrientation: 'north' | 'south' | 'east' | 'west';
          
          if (isHorizontal) {
            // Wall runs east-west, door faces north or south
            const wallCenterZ = (startWorld.z + endWorld.z) / 2;
            doorOrientation = worldZ < wallCenterZ ? 'south' : 'north';
          } else {
            // Wall runs north-south, door faces east or west
            const wallCenterX = (startWorld.x + endWorld.x) / 2;
            doorOrientation = worldX < wallCenterX ? 'east' : 'west';
          }
          
          if (!closestWall || distance < closestWall.distance) {
            closestWall = { wall, orientation: doorOrientation, mesh, distance };
          }
        }
      }
    }
    
    return closestWall ? { 
      wall: closestWall.wall, 
      orientation: closestWall.orientation, 
      mesh: closestWall.mesh 
    } : null;
  }

  /**
   * Get the wall mesh by wall ID
   */
  getWallMesh(wallId: string): THREE.Object3D | undefined {
    return this.wallMeshes.get(wallId);
  }
  
  /**
   * Get the wall data by wall ID
   */
  getWall(wallId: string): BuildingWall | undefined {
    for (const building of this.buildings.values()) {
      const wall = building.walls.find(w => w.id === wallId);
      if (wall) return wall;
    }
    return undefined;
  }

  /**
   * Clear all buildings
   */
  clear(): void {
    const buildingIds = Array.from(this.buildings.keys());
    buildingIds.forEach(id => this.deleteBuilding(id));
    this.cellToBuildingMap.clear();
    
    // Clear instanced batches
    this.clearInstancedBatches();
    
    // Clear glass mullions
    this.removeGlassMullions();
    this.isGlassThemeActive = false;
  }
  
  /**
   * Clear all instanced mesh batches
   */
  private clearInstancedBatches(): void {
    // Clear floor tile batches
    for (const batch of this.floorTileBatches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
    }
    this.floorTileBatches.clear();
    
    // Clear wall batches
    for (const batch of this.wallBatches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
    }
    this.wallBatches.clear();
  }
  
  /**
   * Set opacity for all instanced meshes on a floor level
   * Used by FloorManager for floor ghosting
   */
  setFloorOpacity(floorLevel: number, opacity: number): void {
    // Floor tiles
    const floorBatch = this.floorTileBatches.get(floorLevel);
    if (floorBatch) {
      const material = floorBatch.mesh.material as THREE.MeshStandardMaterial;
      material.opacity = opacity;
      material.transparent = opacity < 1;
      material.depthWrite = opacity >= 1;
      material.needsUpdate = true;
    }
    
    // Walls
    for (const [key, batch] of this.wallBatches) {
      if (key.startsWith(`${floorLevel}-`)) {
        const material = batch.mesh.material as THREE.MeshStandardMaterial;
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.depthWrite = opacity >= 1;
        material.needsUpdate = true;
      }
    }
  }
  
  /**
   * Set render order for floor-based transparency
   */
  setFloorRenderOrder(floorLevel: number, renderOrder: number): void {
    const floorBatch = this.floorTileBatches.get(floorLevel);
    if (floorBatch) {
      floorBatch.mesh.renderOrder = renderOrder;
    }
    
    for (const [key, batch] of this.wallBatches) {
      if (key.startsWith(`${floorLevel}-`)) {
        batch.mesh.renderOrder = renderOrder;
      }
    }
  }
  
  /**
   * Set instancing enabled state
   * If changed, rebuild all buildings
   */
  setInstancingEnabled(enabled: boolean): void {
    if (this.useInstancing === enabled) return;
    this.useInstancing = enabled;
    // Rebuild all buildings (expensive but necessary)
    this.rebuildAllBuildings();
  }
  
  /**
   * Set optimizer enabled state
   * If changed, invalidate and rebuild all optimizations
   */
  setOptimizerEnabled(enabled: boolean): void {
    if (this.optimizerEnabled === enabled) return;
    this.optimizerEnabled = enabled;
    this.invalidateAllOptimizations();
    // Rebuild all buildings to apply new optimization state
    this.rebuildAllBuildings();
  }
  
  /**
   * Set readonly mode (affects optimization aggressiveness)
   */
  setReadonlyMode(readonly: boolean): void {
    if (this.isReadonly === readonly) return;
    this.isReadonly = readonly;
    // Rebuild with new optimization strategy
    this.invalidateAllOptimizations();
    this.rebuildAllBuildings();
  }
  
  /**
   * Set frustum culling enabled state
   */
  setFrustumCullingEnabled(enabled: boolean): void {
    if (this.frustumCullingEnabled === enabled) return;
    this.frustumCullingEnabled = enabled;
    
    // Update existing meshes
    this.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh && 
          (object.userData.isBatchedWalls ||
           object.userData.isBatchedRoofTiles ||
           object.userData.isBatchedFloorTiles)) {
        object.frustumCulled = enabled;
      }
    });
  }
  
  /**
   * Invalidate all optimizations
   */
  private invalidateAllOptimizations(): void {
    this.floorOptimizations.clear();
    this.roofOptimizations.clear();
  }
  
  /**
   * Invalidate optimizations for a specific building or floor
   */
  private invalidateOptimizations(buildingId?: string, floorLevel?: number): void {
    if (buildingId && floorLevel !== undefined) {
      // Invalidate specific floor/roof
      this.floorOptimizations.delete(floorLevel);
      this.roofOptimizations.delete(buildingId);
    } else if (buildingId) {
      // Invalidate all floors for a building (roof only)
      this.roofOptimizations.delete(buildingId);
    } else {
      // Invalidate all
      this.invalidateAllOptimizations();
    }
  }
  
  /**
   * Rebuild all buildings with current settings
   */
  private rebuildAllBuildings(): void {
    const buildings = Array.from(this.buildings.values());
    buildings.forEach(building => {
      building.floors.forEach(floor => {
        this.regenerateWallsForBuilding(building, floor.level);
        this.generateFloorTiles(building, floor.level);
      });
      this.generateRoof(building);
    });
  }
  
  /**
   * Rebuild floor optimization for a building
   */
  private rebuildFloorOptimization(building: Building, floorLevel: number): OptimizationResult | null {
    if (!this.optimizerEnabled) return null;
    
    // Collect cells
    const cells: Array<{x: number, z: number}> = [];
    const uniqueCells = new Set<string>();
    
    building.footprints.forEach(footprint => {
      for (let x = footprint.minX; x <= footprint.maxX; x++) {
        for (let z = footprint.minZ; z <= footprint.maxZ; z++) {
          const cellKey = `${x},${z}`;
          if (!uniqueCells.has(cellKey)) {
            uniqueCells.add(cellKey);
            cells.push({x, z});
          }
        }
      }
    });
    
    // Optimize
    const result = GeometryOptimizer.optimize(cells, {
      readonly: this.isReadonly,
      maxRectangleSize: this.isReadonly ? undefined : 50, // Limit in edit mode
    });
    
    // Validate result
    if (!GeometryOptimizer.validateResult(cells, result)) {
      console.error('[BuildingManager] Optimization validation failed, using per-cell rendering');
      return null;
    }
    
    this.floorOptimizations.set(floorLevel, result);
    return result;
  }
  
  /**
   * Rebuild roof optimization for a building
   */
  private rebuildRoofOptimization(building: Building): OptimizationResult | null {
    if (!this.optimizerEnabled) return null;
    
    // Collect cells
    const cells: Array<{x: number, z: number}> = [];
    const uniqueCells = new Set<string>();
    
    building.footprints.forEach(footprint => {
      for (let x = footprint.minX; x <= footprint.maxX; x++) {
        for (let z = footprint.minZ; z <= footprint.maxZ; z++) {
          const cellKey = `${x},${z}`;
          if (!uniqueCells.has(cellKey)) {
            uniqueCells.add(cellKey);
            cells.push({x, z});
          }
        }
      }
    });
    
    // Optimize
    const result = GeometryOptimizer.optimize(cells, {
      readonly: this.isReadonly,
      maxRectangleSize: this.isReadonly ? undefined : 50,
    });
    
    // Validate result
    if (!GeometryOptimizer.validateResult(cells, result)) {
      console.error('[BuildingManager] Roof optimization validation failed, using per-cell rendering');
      return null;
    }
    
    this.roofOptimizations.set(building.id, result);
    return result;
  }
  
  /**
   * Create floor tiles from optimized rectangles
   */
  private createOptimizedFloorTiles(
    _building: Building,
    floorLevel: number,
    optimization: OptimizationResult
  ): void {
    const batch = this.getOrCreateFloorTileBatch(floorLevel);
    const gridSize = this.gridSystem.getGridSize();
    const floorY = floorLevel * FLOOR_HEIGHT * gridSize + 0.05;
    
    // Clear existing instances in batch
    batch.instances.clear();
    batch.mesh.count = 0;
    batch.freeIndices = [];
    
    optimization.rectangles.forEach((rect) => {
      const instanceIndex = this.allocateInstance(batch);
      
      // Calculate rectangle dimensions and center
      const width = (rect.maxX - rect.minX + 1) * gridSize;
      const depth = (rect.maxZ - rect.minZ + 1) * gridSize;
      const centerX = (rect.minX + rect.maxX + 1) * gridSize / 2;
      const centerZ = (rect.minZ + rect.maxZ + 1) * gridSize / 2;
      
      // Use scale in instance matrix (more memory efficient)
      this.tempPosition.set(centerX, floorY, centerZ);
      this.tempScale.set(width / gridSize, 1, depth / gridSize);
      this.tempQuaternion.identity();
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
      
      // Track which cells this rectangle covers (for tile ID mapping)
      rect.instanceIndex = instanceIndex;
    });
    
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.mesh.frustumCulled = this.frustumCullingEnabled;
  }
  
  /**
   * Create individual markers for selection/interaction
   * CRITICAL: Always called, regardless of optimization
   */
  private createFloorTileMarkers(
    building: Building,
    floorLevel: number,
    cells: Array<{x: number, z: number}>
  ): void {
    const gridSize = this.gridSystem.getGridSize();
    const floorY = floorLevel * FLOOR_HEIGHT * gridSize + 0.05;
    const floor = building.floors.find(f => f.level === floorLevel);
    if (!floor) return;
    
    cells.forEach(({x, z}) => {
      const tileId = `floor-tile-${building.id}-${floorLevel}-${x}-${z}`;
      const worldPos = this.gridSystem.gridToWorld({ x, z, y: 0 });
      
      // Create invisible marker (same as existing code)
      const marker = new THREE.Object3D();
      marker.position.set(
        worldPos.x + gridSize / 2,
        floorY,
        worldPos.z + gridSize / 2
      );
      marker.userData.id = tileId;
      marker.userData.isFloorTile = true;
      marker.userData.buildingId = building.id;
      marker.userData.floor = floorLevel;
      marker.userData.selectable = true;
      marker.userData.gridX = x;
      marker.userData.gridZ = z;
      marker.userData.gridPosition = { x, z };
      marker.userData.isInstanceMarker = true;
      marker.userData.batchKey = `floor-${floorLevel}`;
      
      // Add hitbox for raycasting
      const hitboxGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
      hitboxGeometry.rotateX(-Math.PI / 2);
      const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
      marker.add(hitbox);
      
      this.scene.add(marker);
      floor.groundTileIds.push(tileId);
      this.floorTileMeshes.set(tileId, marker);
      
      this.callbacks.onFloorTileCreated(tileId, marker);
    });
  }
  
  /**
   * Create per-cell floor tiles (fallback when optimizer disabled or fails)
   */
  private createPerCellFloorTiles(
    building: Building,
    floorLevel: number,
    cellList: Array<{x: number, z: number}>
  ): void {
    const gridSize = this.gridSystem.getGridSize();
    const floor = building.floors.find(f => f.level === floorLevel);
    if (!floor) return;
    
    for (const { x, z } of cellList) {
      const worldPos = this.gridSystem.gridToWorld({ x, z, y: 0 });
      const tileId = `floor-tile-${building.id}-${floorLevel}-${x}-${z}`;
      
      if (this.useInstancing && this.sharedFloorGeometry && this.sharedFloorMaterial) {
        // Use instanced rendering
        const batch = this.getOrCreateFloorTileBatch(floorLevel);
        const instanceIndex = this.allocateInstance(batch);
        
        // Set instance transform
        this.tempPosition.set(
          worldPos.x + gridSize / 2,
          floorLevel * FLOOR_HEIGHT * gridSize + 0.05,
          worldPos.z + gridSize / 2
        );
        this.tempQuaternion.identity();
        this.tempScale.set(1, 1, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
        batch.mesh.instanceMatrix.needsUpdate = true;
        
        // Track instance
        batch.instances.set(tileId, { instanceIndex });
      } else {
        // Fallback to individual meshes
        const geometry = new THREE.PlaneGeometry(gridSize, gridSize);
        geometry.rotateX(-Math.PI / 2);
        
        const material = new THREE.MeshStandardMaterial({
          color: 0x909090,
          roughness: 0.85,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          worldPos.x + gridSize / 2,
          floorLevel * FLOOR_HEIGHT * gridSize + 0.05,
          worldPos.z + gridSize / 2
        );
        mesh.userData.isFloorTile = true;
        mesh.userData.buildingId = building.id;
        mesh.userData.floor = floorLevel;
        mesh.userData.id = tileId;
        mesh.userData.selectable = true;
        mesh.userData.gridX = x;
        mesh.userData.gridZ = z;
        mesh.userData.gridPosition = { x, z };
        mesh.receiveShadow = true;

        this.scene.add(mesh);
        floor.groundTileIds.push(tileId);
        this.floorTileMeshes.set(tileId, mesh);

        this.callbacks.onFloorTileCreated(tileId, mesh);
      }
    }
  }
  
  /**
   * Create roof tiles from optimized rectangles
   */
  private createOptimizedRoofTiles(
    _building: Building,
    maxFloorLevel: number,
    roofY: number,
    roofRenderOrder: number,
    optimization: OptimizationResult,
    _roofTileIds: string[]
  ): void {
    const batch = this.getOrCreateRoofTileBatch();
    const gridSize = this.gridSystem.getGridSize();
    
    // Set render order and floor level for the batched roof mesh
    batch.mesh.renderOrder = roofRenderOrder;
    batch.mesh.userData.floorLevel = maxFloorLevel + 1;
    
    // Clear existing instances in batch
    batch.instances.clear();
    batch.mesh.count = 0;
    batch.freeIndices = [];
    
    optimization.rectangles.forEach((rect) => {
      const instanceIndex = this.allocateInstance(batch);
      
      // Calculate rectangle dimensions and center
      const width = (rect.maxX - rect.minX + 1) * gridSize;
      const depth = (rect.maxZ - rect.minZ + 1) * gridSize;
      const centerX = (rect.minX + rect.maxX + 1) * gridSize / 2;
      const centerZ = (rect.minZ + rect.maxZ + 1) * gridSize / 2;
      
      // Use scale in instance matrix
      this.tempPosition.set(centerX, roofY, centerZ);
      this.tempScale.set(width / gridSize, 1, depth / gridSize);
      this.tempQuaternion.identity();
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
      
      // Track which cells this rectangle covers
      rect.instanceIndex = instanceIndex;
    });
    
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.mesh.frustumCulled = this.frustumCullingEnabled;
  }
  
  /**
   * Create per-cell roof tiles (fallback when optimizer disabled or fails)
   */
  private createPerCellRoofTiles(
    building: Building,
    maxFloorLevel: number,
    roofY: number,
    roofRenderOrder: number,
    cellList: Array<{x: number, z: number}>,
    roofTileIds: string[]
  ): void {
    const gridSize = this.gridSystem.getGridSize();
    
    for (const { x, z } of cellList) {
      const worldPos = this.gridSystem.gridToWorld({ x, z, y: 0 });
      const tileId = `roof-tile-${building.id}-${x}-${z}`;
      
      if (this.useInstancing && this.sharedRoofGeometry && this.sharedRoofMaterial) {
        const batch = this.getOrCreateRoofTileBatch();
        batch.mesh.renderOrder = roofRenderOrder;
        batch.mesh.userData.floorLevel = maxFloorLevel + 1;
        const instanceIndex = this.allocateInstance(batch);
        
        this.tempPosition.set(
          worldPos.x + gridSize / 2,
          roofY,
          worldPos.z + gridSize / 2
        );
        this.tempQuaternion.identity();
        this.tempScale.set(1, 1, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
        batch.mesh.instanceMatrix.needsUpdate = true;
        
        batch.instances.set(tileId, { instanceIndex });
      } else {
        // Fallback to individual meshes
        const geometry = new THREE.PlaneGeometry(gridSize, gridSize);
        geometry.rotateX(-Math.PI / 2);
        
        const material = new THREE.MeshStandardMaterial({
          color: 0x666666,
          roughness: 0.7,
          metalness: 0.2,
          side: THREE.DoubleSide,
          transparent: true,
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(worldPos.x + gridSize / 2, roofY, worldPos.z + gridSize / 2);
        mesh.userData.isRoof = true;
        mesh.userData.isRoofTile = true;
        mesh.userData.buildingId = building.id;
        mesh.userData.floor = maxFloorLevel + 1;
        mesh.renderOrder = roofRenderOrder;
        mesh.userData.id = tileId;
        mesh.userData.selectable = false;
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.visible = false;
        
        this.scene.add(mesh);
        this.roofTileMeshes.set(tileId, mesh);
      }
      
      roofTileIds.push(tileId);
    }
  }
  
  /**
   * Create individual markers for roof tiles
   * CRITICAL: Always called, regardless of optimization
   */
  private createRoofTileMarkers(
    building: Building,
    maxFloorLevel: number,
    roofY: number,
    cellList: Array<{x: number, z: number}>,
    _roofTileIds: string[]
  ): void {
    const gridSize = this.gridSystem.getGridSize();
    
    cellList.forEach(({x, z}) => {
      const tileId = `roof-tile-${building.id}-${x}-${z}`;
      const worldPos = this.gridSystem.gridToWorld({ x, z, y: 0 });
      
      // Create invisible marker
      const marker = new THREE.Object3D();
      marker.position.set(worldPos.x + gridSize / 2, roofY, worldPos.z + gridSize / 2);
      marker.userData.isRoof = true;
      marker.userData.isRoofTile = true;
      marker.userData.buildingId = building.id;
      marker.userData.floor = maxFloorLevel + 1;
      marker.userData.id = tileId;
      marker.userData.selectable = false;
      marker.userData.gridX = x;
      marker.userData.gridZ = z;
      marker.userData.isInstanceMarker = true;
      
      this.scene.add(marker);
      this.roofTileMeshes.set(tileId, marker);
    });
  }
  
  /**
   * Get instanced mesh rendering stats
   */
  getInstanceStats(): {
    floorTileBatches: number;
    wallBatches: number;
    totalInstances: number;
    totalDrawCalls: number;
  } {
    let totalInstances = 0;
    
    for (const batch of this.floorTileBatches.values()) {
      totalInstances += batch.instances.size;
    }
    for (const batch of this.wallBatches.values()) {
      totalInstances += batch.instances.size;
    }
    
    const totalDrawCalls = this.floorTileBatches.size + this.wallBatches.size;
    
    return {
      floorTileBatches: this.floorTileBatches.size,
      wallBatches: this.wallBatches.size,
      totalInstances,
      totalDrawCalls,
    };
  }
  
  /**
   * Dispose all resources including shared geometries and materials
   */
  dispose(): void {
    this.clear();
    
    // Dispose shared resources
    if (this.sharedFloorGeometry) {
      this.sharedFloorGeometry.dispose();
      this.sharedFloorGeometry = null;
    }
    if (this.sharedFloorMaterial) {
      this.sharedFloorMaterial.dispose();
      this.sharedFloorMaterial = null;
    }
    if (this.sharedWallGeometry) {
      this.sharedWallGeometry.dispose();
      this.sharedWallGeometry = null;
    }
    if (this.sharedWallMaterial) {
      this.sharedWallMaterial.dispose();
      this.sharedWallMaterial = null;
    }
  }

  /**
   * Handle stairwell placement - removes floor tiles where stairwell is placed
   * and marks the stairwell as connecting floors
   */
  handleStairwellPlacement(buildingId: string, position: GridPosition, floorLevel: number): void {
    const building = this.buildings.get(buildingId);
    if (!building) return;

    const floor = building.floors.find(f => f.level === floorLevel);
    if (!floor) return;

    // Remove floor tiles at stairwell position
    // Stairwells typically occupy a 2x2 area
    const tilesToRemove: string[] = [];
    const stairwellSize = 2; // 2x2 grid units

    for (let x = 0; x < stairwellSize; x++) {
      for (let z = 0; z < stairwellSize; z++) {
        const tileX = position.x + x;
        const tileZ = position.z + z;
        
        // Find and mark tiles for removal
        floor.groundTileIds.forEach(tileId => {
          const mesh = this.floorTileMeshes.get(tileId);
          if (mesh) {
            const tilePos = mesh.userData.gridPosition;
            if (tilePos && tilePos.x === tileX && tilePos.z === tileZ) {
              tilesToRemove.push(tileId);
            }
          }
        });
      }
    }

    // Remove the tiles
    tilesToRemove.forEach(tileId => {
      const mesh = this.floorTileMeshes.get(tileId);
      if (mesh) {
        this.scene.remove(mesh);
        if (mesh instanceof THREE.Mesh) {
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
        this.floorTileMeshes.delete(tileId);
      }
      
      const index = floor.groundTileIds.indexOf(tileId);
      if (index > -1) {
        floor.groundTileIds.splice(index, 1);
      }
    });

    building.updatedAt = new Date();
  }

  /**
   * Check if a position has a stairwell that connects floors
   */
  hasStairwellAt(_position: GridPosition): boolean {
    // This would be expanded to check actual placed stairwell objects
    // For now, return false - actual implementation would check scene
    return false;
  }

  /**
   * Get all floor levels that a stairwell at position connects
   */
  getConnectedFloors(position: GridPosition): number[] {
    const connectedFloors: number[] = [];
    
    for (const building of this.buildings.values()) {
      // Check if position is inside this building
      const isInside = building.footprints.some(fp =>
        position.x >= fp.minX && position.x <= fp.maxX &&
        position.z >= fp.minZ && position.z <= fp.maxZ
      );
      
      if (isInside) {
        // If there's a stairwell here, it connects all floors
        // This would check actual stairwell placement
        building.floors.forEach(floor => {
          connectedFloors.push(floor.level);
        });
      }
    }
    
    return connectedFloors.sort((a, b) => a - b);
  }

  /**
   * Apply building materials to all building elements (walls, floors, roofs)
   * Supports transparency for glass building themes
   * @param isGlassTheme optional flag to control glass mullions (defaults to false)
   */
  applyBuildingMaterials(materials: BuildingMaterials, isGlassTheme: boolean = false): void {
    // Update wall materials
    this.wallBatches.forEach((batch) => {
      const mat = batch.mesh.material as THREE.MeshStandardMaterial;
      if (mat && materials.wall) {
        mat.color.setStyle(materials.wall.color);
        mat.metalness = materials.wall.metalness;
        mat.roughness = materials.wall.roughness;

        // Optional texture
        if (materials.wall.textureUrl) {
          const tex = this.getTexture(materials.wall.textureUrl);
          mat.map = tex;
          mat.needsUpdate = true;
        } else {
          mat.map = null;
        }

        // Shader hints
        if (materials.wall.shader === 'wireframe') {
          mat.wireframe = true;
        } else {
          mat.wireframe = false;
        }
        // Mullions handled separately; paned-glass just uses transparency below
        // Handle transparency for glass walls
        if (materials.wall.transparent) {
          const baseOpacity = materials.wall.opacity ?? 0.5;
          mat.transparent = true;
          mat.opacity = baseOpacity;
          mat.depthWrite = false; // Important for proper transparency rendering
          mat.side = THREE.DoubleSide; // See glass from inside too
          // Store base opacity for ghosting calculations (effective opacity = baseOpacity * ghostOpacity)
          mat.userData.baseOpacity = baseOpacity;
          mat.userData.isNaturallyTransparent = true;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
          mat.side = THREE.FrontSide;
          mat.userData.baseOpacity = 1.0;
          mat.userData.isNaturallyTransparent = false;
        }
        mat.needsUpdate = true;
      }
    });

    // Update floor tile materials
    this.floorTileBatches.forEach((batch) => {
      const mat = batch.mesh.material as THREE.MeshStandardMaterial;
      if (mat && materials.floor) {
        mat.color.setStyle(materials.floor.color);
        mat.metalness = materials.floor.metalness;
        mat.roughness = materials.floor.roughness;
        if (materials.floor.textureUrl) {
          mat.map = this.getTexture(materials.floor.textureUrl);
          mat.needsUpdate = true;
        } else {
          mat.map = null;
        }
        mat.wireframe = materials.floor.shader === 'wireframe';
        // Floors generally shouldn't be transparent, but support it just in case
        if (materials.floor.transparent) {
          const baseOpacity = materials.floor.opacity ?? 0.8;
          mat.transparent = true;
          mat.opacity = baseOpacity;
          mat.userData.baseOpacity = baseOpacity;
          mat.userData.isNaturallyTransparent = true;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
          mat.userData.baseOpacity = 1.0;
          mat.userData.isNaturallyTransparent = false;
        }
        mat.needsUpdate = true;
      }
    });

    // Update roof materials
    if (this.roofTileBatch) {
      const mat = this.roofTileBatch.mesh.material as THREE.MeshStandardMaterial;
      if (mat && materials.roof) {
        mat.color.setStyle(materials.roof.color);
        mat.metalness = materials.roof.metalness;
        mat.roughness = materials.roof.roughness;
        if (materials.roof.textureUrl) {
          mat.map = this.getTexture(materials.roof.textureUrl);
          mat.needsUpdate = true;
        } else {
          mat.map = null;
        }
        mat.wireframe = materials.roof.shader === 'wireframe';
        // Handle transparency for glass roofs
        if (materials.roof.transparent) {
          const baseOpacity = materials.roof.opacity ?? 0.6;
          mat.transparent = true;
          mat.opacity = baseOpacity;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
          mat.userData.baseOpacity = baseOpacity;
          mat.userData.isNaturallyTransparent = true;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
          mat.side = THREE.FrontSide;
          mat.userData.baseOpacity = 1.0;
          mat.userData.isNaturallyTransparent = false;
        }
        mat.needsUpdate = true;
      }
    }
    
    // Handle glass mullions based on explicit glass theme flag
    if (isGlassTheme && !this.isGlassThemeActive) {
      this.createGlassMullions();
      this.isGlassThemeActive = true;
    } else if (!isGlassTheme && this.isGlassThemeActive) {
      this.removeGlassMullions();
      this.isGlassThemeActive = false;
    }
    
    // For glass themes, show the roof with transparency (it looks good!)
    // For non-glass themes, roof visibility is controlled by FloorManager
    if (isGlassTheme && this.roofTileBatch) {
      this.setRoofsVisible(true, materials.roof?.opacity ?? 0.6);
    }
  }
  
  /**
   * Create glass mullions (vertical dividers) for all existing walls
   * These give glass walls the appearance of individual glass panels
   */
  private createGlassMullions(): void {
    const gridSize = this.gridSystem.getGridSize();
    const mullionWidth = 0.008; // Very thin subtle mullion
    const mullionDepth = 0.02; // Minimal protrusion
    
    // Mullion material - subtle dark aluminum (less reflective)
    const mullionMaterial = new THREE.MeshStandardMaterial({
      color: 0x606870, // Darker, more subtle
      metalness: 0.4, // Less shiny
      roughness: 0.4,
    });
    
    // Calculate mullion spacing - approximately every 1.5 grid units for a realistic look
    const mullionSpacing = gridSize * 1.5;
    
    // Process each building's walls (walls are at building level, not floor level)
    for (const building of this.buildings.values()) {
      // Iterate through building walls directly
      if (building.walls && Array.isArray(building.walls)) {
        for (const wall of building.walls) {
          this.addMullionsToWall(wall, mullionMaterial, mullionSpacing, mullionWidth, mullionDepth);
        }
      }
    }
  }
  
  /**
   * Add vertical mullions to a single wall
   */
  private addMullionsToWall(
    wall: BuildingWall, 
    material: THREE.MeshStandardMaterial, 
    spacing: number, 
    width: number, 
    depth: number
  ): void {
    // Safety check for wall positions
    if (!wall || !wall.startPos || !wall.endPos) {
      console.warn('[BuildingManager] Wall missing or invalid positions:', wall);
      return;
    }
    
    // Additional validation for position coordinates
    if (typeof wall.startPos.x !== 'number' || typeof wall.startPos.z !== 'number' ||
        typeof wall.endPos.x !== 'number' || typeof wall.endPos.z !== 'number') {
      console.warn('[BuildingManager] Wall has invalid position coordinates:', { 
        startPos: wall.startPos, 
        endPos: wall.endPos 
      });
      return;
    }
    
    const gridSize = this.gridSystem.getGridSize();
    const height = FLOOR_HEIGHT * gridSize;
    const startWorld = this.gridSystem.gridToWorld({ x: wall.startPos.x, z: wall.startPos.z, y: 0 });
    const endWorld = this.gridSystem.gridToWorld({ x: wall.endPos.x, z: wall.endPos.z, y: 0 });
    
    // Calculate wall length and direction
    const dx = endWorld.x - startWorld.x;
    const dz = endWorld.z - startWorld.z;
    const wallLength = Math.sqrt(dx * dx + dz * dz);
    
    if (wallLength < spacing) return; // Wall too short for mullions
    
    // Normalize direction
    const dirX = dx / wallLength;
    const dirZ = dz / wallLength;
    
    // Perpendicular direction for offsetting mullions slightly
    const perpX = -dirZ;
    const perpZ = dirX;
    
    // Calculate center and base Y
    const centerX = (startWorld.x + endWorld.x) / 2;
    const centerZ = (startWorld.z + endWorld.z) / 2;
    const baseY = wall.floorLevel * height;
    
    // Create mullion geometry
    const mullionGeometry = new THREE.BoxGeometry(width, height * 0.98, depth);
    
    // Calculate number of mullions
    const numMullions = Math.floor(wallLength / spacing);
    if (numMullions < 1) return;
    
    // Create a group to hold all mullions for this wall
    const mullionGroup = new THREE.Group();
    mullionGroup.userData.wallId = wall.id;
    mullionGroup.userData.isGlassMullion = true;
    mullionGroup.userData.floor = wall.floorLevel;
    
    // Position mullions along the wall
    for (let i = 1; i < numMullions + 1; i++) {
      const t = i / (numMullions + 1);
      const x = startWorld.x + dx * t + perpX * depth * 0.5;
      const z = startWorld.z + dz * t + perpZ * depth * 0.5;
      
      const mullion = new THREE.Mesh(mullionGeometry, material.clone());
      mullion.position.set(x, baseY + height / 2, z);
      
      // Rotate to align with wall
      const angle = Math.atan2(dirX, dirZ);
      mullion.rotation.y = angle;
      
      mullion.castShadow = true;
      mullion.userData.isGlassMullion = true;
      
      mullionGroup.add(mullion);
    }
    
    // Add horizontal mullion at middle height (creates the classic glass panel look)
    const horizontalMullionGeometry = new THREE.BoxGeometry(wallLength, width, depth);
    const horizontalMullion = new THREE.Mesh(horizontalMullionGeometry, material.clone());
    horizontalMullion.position.set(centerX + perpX * depth * 0.5, baseY + height * 0.5, centerZ + perpZ * depth * 0.5);
    
    // Rotate to align with wall
    const angle = Math.atan2(dirX, dirZ);
    horizontalMullion.rotation.y = angle;
    horizontalMullion.castShadow = true;
    horizontalMullion.userData.isGlassMullion = true;
    mullionGroup.add(horizontalMullion);
    
    this.scene.add(mullionGroup);
    this.glassMullions.add(mullionGroup);
  }
  
  /**
   * Remove all glass mullions from the scene
   */
  private removeGlassMullions(): void {
    for (const mullionGroup of this.glassMullions) {
      // Dispose geometries and materials
      mullionGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(mullionGroup);
    }
    this.glassMullions.clear();
  }

}

