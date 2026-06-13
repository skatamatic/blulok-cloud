/**
 * Ground Tile Manager
 * 
 * Manages instanced rendering of ground tiles (pavement, grass, gravel).
 * Uses THREE.InstancedMesh for efficient batch rendering of many identical tiles.
 * 
 * This dramatically reduces draw calls when users place hundreds or thousands
 * of ground tiles for parking lots, lawns, pathways, etc.
 */

import * as THREE from 'three';
import { GridSystem } from './GridSystem';
import { AssetCategory, GridPosition, PartMaterial } from './types';
import { OptimizationResult } from './utils/GeometryOptimizer';
import { OptimizationManager } from './OptimizationManager';
import {
  OptimizationClient,
  OptimizationContext,
} from './utils/OptimizationClient';

/** Instance data for tracking */
interface TileInstance {
  instanceIndex: number;
  position: GridPosition;
  category: AssetCategory;
}

/** Batch of instanced tiles by category */
interface TileBatch {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
  instances: Map<string, TileInstance>; // objectId -> instance
  freeIndices: number[];
  maxCount: number;
}

/** Default colors for ground tiles */
const DEFAULT_COLORS: Record<AssetCategory.PAVEMENT | AssetCategory.GRASS | AssetCategory.GRAVEL, string> = {
  [AssetCategory.PAVEMENT]: '#505860',
  [AssetCategory.GRASS]: '#3d7a3d',
  [AssetCategory.GRAVEL]: '#a8957a',
};

const DEFAULT_MATERIALS: Record<string, { metalness: number; roughness: number }> = {
  [AssetCategory.PAVEMENT]: { metalness: 0.02, roughness: 0.85 },
  [AssetCategory.GRASS]: { metalness: 0.0, roughness: 0.95 },
  [AssetCategory.GRAVEL]: { metalness: 0.05, roughness: 0.95 },
};

export class GroundTileManager implements OptimizationClient {
  private scene: THREE.Scene;
  private gridSystem: GridSystem;
  
  // LOGICAL LAYOUT: Source of truth for what tiles exist (objectId -> position, category)
  private logicalTiles: Map<string, {position: GridPosition, category: AssetCategory}> = new Map();
  /** O(1) grid cell -> objectId for picking */
  private tileByCell: Map<string, string> = new Map();
  
  // RENDERED LAYOUT: Instanced mesh batches for rendering (separate from logical data)
  private batches: Map<AssetCategory, TileBatch> = new Map();
  
  // Shared geometry (all ground tiles are the same shape)
  private sharedGeometry: THREE.BoxGeometry | null = null;
  
  // Shared invisible material for markers (all markers use the same material)
  private sharedMarkerMaterial: THREE.MeshBasicMaterial | null = null;
  
  // Temp objects for matrix calculations
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3(1, 1, 1);
  
  // Configuration
  private readonly TILE_HEIGHT = 0.05;
  private readonly INITIAL_CAPACITY = 500;
  
  // Rendering state
  private frustumCullingEnabled: boolean = true;
  private useInstancing: boolean = true;
  
  // Centralized optimization manager
  private optimizationManager: OptimizationManager;
  
  constructor(scene: THREE.Scene, gridSystem: GridSystem) {
    this.scene = scene;
    this.gridSystem = gridSystem;
    this.optimizationManager = OptimizationManager.getInstance();
    this.initializeSharedGeometry();
    
    // Register as optimization client
    this.optimizationManager.registerClient(this);
  }
  
  /**
   * OptimizationClient implementation
   */
  getOptimizationId(): string {
    return 'ground-tile-manager';
  }
  
  getOptimizationContexts(): OptimizationContext[] {
    const contexts: OptimizationContext[] = [];
    
    // Read from LOGICAL LAYOUT (source of truth), not from rendered batches
    // Group tiles by category
    const tilesByCategory = new Map<AssetCategory, Array<{x: number, z: number}>>();
    
    this.logicalTiles.forEach((tile) => {
      if (!tilesByCategory.has(tile.category)) {
        tilesByCategory.set(tile.category, []);
      }
      tilesByCategory.get(tile.category)!.push({ x: tile.position.x, z: tile.position.z });
    });
    
    // Create a context for each category that has tiles
    tilesByCategory.forEach((cells, category) => {
      contexts.push({
        id: `ground-tile-${category}`,
        cells,
        options: {
          // Solid-color tiles do not need texture tiling limits; allow full merges in edit mode.
          maxRectangleSize: this.optimizationManager.isReadonlyMode() ? undefined : 4096,
        },
        metadata: { category },
      });
    });
    
    return contexts;
  }
  
  onOptimizationComplete(contextId: string, result: OptimizationResult): void {
    // Extract category from context ID (format: "ground-tile-{category}")
    const categoryStr = contextId.replace('ground-tile-', '');
    const category = categoryStr as AssetCategory;
    
    if (!this.isGroundTileCategory(category)) {
      console.warn(`[GroundTileManager] Unknown category in optimization result: ${category}`);
      return;
    }
    
    // Build cellToObjectId mapping from LOGICAL LAYOUT (source of truth)
    // This ensures we map all cells correctly, including any tiles added since optimization was requested
    const cellToObjectId = new Map<string, string>();
    this.logicalTiles.forEach((tile, objectId) => {
      if (tile.category === category) {
        const cellKey = `${tile.position.x},${tile.position.z}`;
        cellToObjectId.set(cellKey, objectId);
      }
    });
    
    // Rebuild rendered batch completely from optimized result
    // All tiles in logicalTiles are covered by the optimization result (validation ensures this)
    this.rebuildBatchFromOptimization(category, result, cellToObjectId);
  }
  
  onOptimizationInvalidated(contextId?: string): void {
    // When optimization is disabled, rebuild all batches without optimization (1 tile = 1 instance)
    if (!this.optimizationManager.isEnabled()) {
      if (contextId) {
        // Specific category invalidated - rebuild just that category
        const categoryStr = contextId.replace('ground-tile-', '');
        const category = categoryStr as AssetCategory;
        if (this.isGroundTileCategory(category)) {
          this.rebuildBatchWithoutOptimization(category);
        }
      } else {
        // All categories invalidated - rebuild all categories
        this.rebuildAllBatchesWithoutOptimization();
      }
    }
  }
  
  /**
   * Initialize shared geometry for all ground tiles
   */
  private initializeSharedGeometry(): void {
    const gridSize = this.gridSystem.getGridSize();
    // Create geometry centered at origin, sized to grid
    this.sharedGeometry = new THREE.BoxGeometry(
      gridSize * 0.98, // Slightly smaller than grid for visual gaps
      this.TILE_HEIGHT,
      gridSize * 0.98
    );
    // Offset Y so bottom is at 0
    this.sharedGeometry.translate(0, this.TILE_HEIGHT / 2, 0);
    
    // Create shared invisible material for markers (all markers share this)
    this.sharedMarkerMaterial = new THREE.MeshBasicMaterial({ visible: false });
  }
  
  /**
   * Get or create a batch for a category
   */
  private getOrCreateBatch(category: AssetCategory): TileBatch {
    let batch = this.batches.get(category);
    
    if (!batch && this.sharedGeometry) {
      // Only handle ground tile categories
      const color = (category === AssetCategory.PAVEMENT || category === AssetCategory.GRASS || category === AssetCategory.GRAVEL)
        ? DEFAULT_COLORS[category]
        : '#808080';
      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: DEFAULT_MATERIALS[category]?.metalness ?? 0.1,
        roughness: DEFAULT_MATERIALS[category]?.roughness ?? 0.9,
      });
      
      const mesh = new THREE.InstancedMesh(
        this.sharedGeometry,
        material,
        this.INITIAL_CAPACITY
      );
      mesh.name = `ground-tiles-${category}`;
      mesh.count = 0;
      mesh.frustumCulled = this.frustumCullingEnabled;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.isGroundTileBatch = true;
      mesh.userData.category = category;
      
      this.scene.add(mesh);
      
      batch = {
        mesh,
        material,
        instances: new Map(),
        freeIndices: [],
        maxCount: this.INITIAL_CAPACITY,
      };
      
      this.batches.set(category, batch);
    }
    
    return batch!;
  }
  
  /**
   * Add a ground tile instance (internal, without optimization request)
   * Updates logical layout and returns marker object
   * Used by addTilesBatch for efficient batch operations
   */
  private addTileInternal(
    objectId: string,
    category: AssetCategory,
    position: GridPosition
  ): THREE.Object3D {
    // 1. Update LOGICAL LAYOUT (source of truth)
    this.logicalTiles.set(objectId, { position, category });
    this.tileByCell.set(`${position.x},${position.z}`, objectId);
    
    // 2. Lightweight marker for selection/highlight (not added to scene graph)
    const gridSize = this.gridSystem.getGridSize();
    const worldPos = this.gridSystem.gridToWorld(position);
    const marker = new THREE.Object3D();
    marker.position.set(
      worldPos.x + gridSize / 2,
      0,
      worldPos.z + gridSize / 2
    );
    marker.userData.id = objectId;
    marker.userData.isGroundTile = true;
    marker.userData.category = category;
    marker.userData.gridPosition = position;
    marker.userData.selectable = true;
    marker.userData.instanceBatch = category;

    // Hitbox child for selection outlines only (not in scene graph)
    if (this.sharedGeometry && this.sharedMarkerMaterial) {
      const hitbox = new THREE.Mesh(this.sharedGeometry, this.sharedMarkerMaterial);
      marker.add(hitbox);
    }
    
    return marker;
  }
  
  /**
   * Add a ground tile instance
   * Updates logical layout and triggers optimization/re-render
   * Returns a marker object for selection/interaction
   */
  addTile(
    objectId: string,
    category: AssetCategory,
    position: GridPosition
  ): THREE.Object3D {
    const marker = this.addTileInternal(objectId, category, position);
    
    // If optimization is disabled, rebuild immediately without optimization
    if (!this.optimizationManager.isEnabled()) {
      this.rebuildBatchWithoutOptimization(category);
    } else {
      // Request optimization (will trigger full re-render via onOptimizationComplete)
      this.optimizationManager.requestOptimization(`ground-tile-${category}`);
    }
    
    return marker;
  }
  
  /**
   * Add multiple tiles in a batch
   * Only requests optimization once per unique category (much more efficient)
   * Returns array of markers in the same order as the input
   */
  addTilesBatch(
    tiles: Array<{ objectId: string; category: AssetCategory; position: GridPosition }>
  ): THREE.Object3D[] {
    if (tiles.length === 0) return [];
    
    const markers: THREE.Object3D[] = [];
    const categoriesToOptimize = new Set<AssetCategory>();
    
    // Add all tiles to logical layout (fast - no optimization requests)
    for (const tile of tiles) {
      markers.push(this.addTileInternal(tile.objectId, tile.category, tile.position));
      categoriesToOptimize.add(tile.category);
    }
    
    // If optimization is disabled, rebuild immediately without optimization
    if (!this.optimizationManager.isEnabled()) {
      categoriesToOptimize.forEach(category => {
        this.rebuildBatchWithoutOptimization(category);
      });
    } else {
      // Request optimization once per unique category (much more efficient!)
      categoriesToOptimize.forEach(category => {
        this.optimizationManager.requestOptimization(`ground-tile-${category}`);
      });
    }
    
    return markers;
  }
  
  /**
   * Remove a ground tile instance
   * Updates logical layout and triggers optimization/re-render
   */
  removeTile(objectId: string): boolean {
    const tile = this.logicalTiles.get(objectId);
    if (!tile) return false;
    
    const category = tile.category;
    
    // 1. Remove from LOGICAL LAYOUT (source of truth)
    this.logicalTiles.delete(objectId);
    this.tileByCell.delete(`${tile.position.x},${tile.position.z}`);
    
    // 2. Check if this was the last tile in this category
    const hasRemainingTiles = Array.from(this.logicalTiles.values()).some(t => t.category === category);
    
    if (!hasRemainingTiles) {
      // No tiles left in this category - clear the rendered batch immediately
      const batch = this.batches.get(category);
      if (batch) {
        batch.mesh.count = 0;
        batch.instances.clear();
        batch.freeIndices = [];
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      // If optimization is disabled, rebuild immediately without optimization
      if (!this.optimizationManager.isEnabled()) {
        this.rebuildBatchWithoutOptimization(category);
      } else {
        // Request optimization (will trigger full re-render via onOptimizationComplete)
        this.optimizationManager.requestOptimization(`ground-tile-${category}`);
      }
    }
    
    return true;
  }
  
  /**
   * Check if this manager handles a category
   */
  isGroundTileCategory(category: AssetCategory): boolean {
    return category === AssetCategory.PAVEMENT ||
           category === AssetCategory.GRASS ||
           category === AssetCategory.GRAVEL;
  }
  
  /**
   * Get tile instance data from rendered batch
   * Returns undefined if tile doesn't exist or hasn't been rendered yet
   */
  getTileInstance(objectId: string): TileInstance | undefined {
    for (const batch of this.batches.values()) {
      const instance = batch.instances.get(objectId);
      if (instance) return instance;
    }
    return undefined;
  }
  
  /**
   * Check if a tile exists in logical layout
   */
  hasTile(objectId: string): boolean {
    return this.logicalTiles.has(objectId);
  }
  
  /**
   * Get logical tile data
   */
  getLogicalTile(objectId: string): {position: GridPosition, category: AssetCategory} | undefined {
    return this.logicalTiles.get(objectId);
  }
  
  /**
   * Update materials for a category (for theme application)
   */
  updateMaterial(category: AssetCategory, partMaterial: PartMaterial): void {
    const batch = this.batches.get(category);
    if (!batch) return;
    
    batch.material.color.setStyle(partMaterial.color);
    batch.material.metalness = partMaterial.metalness;
    batch.material.roughness = partMaterial.roughness;
    
    // Handle texture (diffuse/color map)
    if (partMaterial.textureUrl) {
      const texture = this.loadTexture(partMaterial.textureUrl);
      batch.material.map = texture;
    } else {
      batch.material.map = null;
    }
    
    // Handle shader hints (wireframe mode)
    if (partMaterial.shader === 'wireframe') {
      batch.material.wireframe = true;
    } else {
      batch.material.wireframe = false;
    }
    
    batch.material.needsUpdate = true;
  }
  
  /**
   * Load a texture from URL with caching
   */
  private textureCache: Map<string, THREE.Texture> = new Map();
  private textureLoader: THREE.TextureLoader | null = null;
  
  private loadTexture(url: string): THREE.Texture {
    // Check cache first
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url)!;
    }
    
    // Create loader if needed
    if (!this.textureLoader) {
      this.textureLoader = new THREE.TextureLoader();
    }
    
    // Load texture
    const texture = this.textureLoader.load(url);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    
    // Cache it
    this.textureCache.set(url, texture);
    
    return texture;
  }
  
  /**
   * Grow a batch when it runs out of capacity
   */
  private growBatch(batch: TileBatch): void {
    const newCapacity = batch.maxCount * 2;
    console.log(`[GroundTileManager] Growing batch from ${batch.maxCount} to ${newCapacity}`);
    
    const newMesh = new THREE.InstancedMesh(
      this.sharedGeometry!,
      batch.material,
      newCapacity
    );
    newMesh.name = batch.mesh.name;
    newMesh.count = batch.mesh.count;
    newMesh.frustumCulled = this.frustumCullingEnabled;
    newMesh.castShadow = false;
    newMesh.receiveShadow = false;
    newMesh.userData = { ...batch.mesh.userData };
    
    // Copy existing matrices
    for (let i = 0; i < batch.mesh.count; i++) {
      batch.mesh.getMatrixAt(i, this.tempMatrix);
      newMesh.setMatrixAt(i, this.tempMatrix);
    }
    newMesh.instanceMatrix.needsUpdate = true;
    
    // Replace in scene
    this.scene.remove(batch.mesh);
    batch.mesh.dispose();
    this.scene.add(newMesh);
    
    batch.mesh = newMesh;
    batch.maxCount = newCapacity;
  }
  
  /**
   * Get all tile IDs for a category (from logical layout)
   */
  getTileIds(category: AssetCategory): string[] {
    const ids: string[] = [];
    this.logicalTiles.forEach((tile, objectId) => {
      if (tile.category === category) {
        ids.push(objectId);
      }
    });
    return ids;
  }
  
  /**
   * Get tile IDs in a grid area (optimized for box selection)
   */
  getTileIdsInArea(minX: number, maxX: number, minZ: number, maxZ: number): string[] {
    const ids: string[] = [];
    this.logicalTiles.forEach((tile, objectId) => {
      const { x, z } = tile.position;
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        ids.push(objectId);
      }
    });
    return ids;
  }

  /**
   * Resolve a ground tile at a grid cell (O(1) lookup for hover/click picking).
   */
  getTileIdAtCell(x: number, z: number): string | null {
    return this.tileByCell.get(`${x},${z}`) ?? null;
  }
  
  
  /**
   * Get total tile count (from logical layout)
   */
  getTotalCount(): number {
    return this.logicalTiles.size;
  }
  
  /**
   * Clear all tiles (both logical and rendered)
   */
  clear(): void {
    // Clear logical layout
    this.logicalTiles.clear();
    this.tileByCell.clear();
    
    // Clear rendered batches
    for (const batch of this.batches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
      batch.material.dispose();
    }
    this.batches.clear();
    
    // Dispose shared marker material (will be recreated on next use if needed)
    if (this.sharedMarkerMaterial) {
      this.sharedMarkerMaterial.dispose();
      this.sharedMarkerMaterial = null;
    }
  }
  
  /**
   * Dispose all resources
   */
  dispose(): void {
    // Unregister from optimization manager
    this.optimizationManager.unregisterClient(this.getOptimizationId());
    
    this.clear();
    if (this.sharedGeometry) {
      this.sharedGeometry.dispose();
      this.sharedGeometry = null;
    }
  }
  
  /**
   * Set instancing enabled state
   */
  setInstancingEnabled(enabled: boolean): void {
    if (this.useInstancing === enabled) return;
    this.useInstancing = enabled;
    // Note: Ground tiles are added incrementally, so we can't easily rebuild
    // This flag will affect future tiles
  }
  
  /**
   * Set optimizer enabled state
   * Delegates to centralized OptimizationManager
   */
  setOptimizerEnabled(enabled: boolean): void {
    this.optimizationManager.setEnabled(enabled);
  }
  
  /**
   * Set readonly mode (affects optimization aggressiveness)
   * Delegates to centralized OptimizationManager
   */
  setReadonlyMode(readonly: boolean): void {
    this.optimizationManager.setReadonlyMode(readonly);
  }
  
  /**
   * Set frustum culling enabled state
   */
  setFrustumCullingEnabled(enabled: boolean): void {
    if (this.frustumCullingEnabled === enabled) return;
    this.frustumCullingEnabled = enabled;
    
    // Update existing meshes
    this.batches.forEach((batch) => {
      batch.mesh.frustumCulled = enabled;
    });
  }
  
  /**
   * Optimize all tiles for a category (batch optimization)
   * This can be called after placing many tiles to optimize them
   * Delegates to centralized OptimizationManager
   */
  optimizeCategory(category: AssetCategory): void {
    this.optimizationManager.requestOptimization(`ground-tile-${category}`);
  }
  
  /**
   * Rebuild rendered batch completely from optimized result
   * This is called after optimization completes - does a complete rebuild
   * All tiles in logicalTiles are covered by the optimization result
   */
  private rebuildBatchFromOptimization(
    category: AssetCategory,
    optimization: OptimizationResult,
    cellToObjectId: Map<string, string>
  ): void {
    const batch = this.getOrCreateBatch(category);
    const gridSize = this.gridSystem.getGridSize();
    
    // Clear existing rendered state completely
    batch.instances.clear();
    batch.mesh.count = 0;
    batch.freeIndices = [];
    
    // Rebuild from optimization result
    // Since we cleared freeIndices, allocateInstanceIndex will allocate sequential indices
    // and increment batch.mesh.count for each rectangle
    optimization.rectangles.forEach((rect) => {
      const instanceIndex = this.allocateInstanceIndex(batch);
      
      // Calculate rectangle center in world coordinates
      const centerX = (rect.minX + rect.maxX + 1) * gridSize / 2;
      const centerZ = (rect.minZ + rect.maxZ + 1) * gridSize / 2;
      
      // Calculate rectangle dimensions in world space
      const width = (rect.maxX - rect.minX + 1) * gridSize;
      const depth = (rect.maxZ - rect.minZ + 1) * gridSize;
      
      // Set position (center in grid cell)
      this.tempPosition.set(centerX, 0, centerZ);
      
      // Use scale in instance matrix
      // Base geometry is gridSize * 0.98 (for visual gaps), so we need to scale to desired size
      this.tempScale.set(width / (gridSize * 0.98), 1, depth / (gridSize * 0.98));
      this.tempQuaternion.identity();
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
      
      // Map all cells in this rectangle to their object IDs
      // This allows removeTile() to work correctly
      for (const cellKey of rect.cells) {
        const objectId = cellToObjectId.get(cellKey);
        if (objectId) {
          // Parse cellKey to get actual cell coordinates (format: "x,z")
          const [cellX, cellZ] = cellKey.split(',').map(Number);
          
          // Store mapping: objectId -> instanceIndex and position
          // Note: position is stored for reference, but instanceIndex is what matters for rendering
          batch.instances.set(objectId, {
            instanceIndex,
            position: { x: cellX, z: cellZ, y: 0 },
            category,
          });
        }
      }
    });
    
    // CRITICAL: batch.mesh.count should already be set correctly by allocateInstanceIndex
    // (it increments count for each rectangle), but verify it equals the number of rectangles
    // This is a safeguard - allocateInstanceIndex should have set it correctly
    const expectedCount = optimization.rectangles.length;
    if (batch.mesh.count !== expectedCount) {
      console.warn(`[GroundTileManager] Count mismatch: expected ${expectedCount}, got ${batch.mesh.count}. Fixing...`);
      batch.mesh.count = expectedCount;
    }
    
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.mesh.frustumCulled = this.frustumCullingEnabled;
    
    // Debug: Log optimization result (should show much fewer instances than tiles)
    const tileCount = this.logicalTiles.size;
    const rectangleCount = optimization.rectangles.length;
    if (tileCount > 100) {
      console.log(`[GroundTileManager] Optimization: ${tileCount} tiles → ${rectangleCount} rectangles (${Math.round((rectangleCount / tileCount) * 100)}% reduction)`);
    }
  }
  
  /**
   * Force immediate optimization of all categories
   * Useful after loading saved data
   * Delegates to centralized OptimizationManager
   */
  optimizeAllCategories(): void {
    this.optimizationManager.optimizeClient(this, true);
  }
  
  /**
   * Rebuild all batches without optimization (1 tile = 1 instance)
   * Used when optimization is disabled
   */
  private rebuildAllBatchesWithoutOptimization(): void {
    // Group tiles by category
    const tilesByCategory = new Map<AssetCategory, Array<{objectId: string, position: GridPosition}>>();
    this.logicalTiles.forEach((tile, objectId) => {
      if (!tilesByCategory.has(tile.category)) {
        tilesByCategory.set(tile.category, []);
      }
      tilesByCategory.get(tile.category)!.push({ objectId, position: tile.position });
    });
    
    // Rebuild each category
    tilesByCategory.forEach((_tiles, category) => {
      this.rebuildBatchWithoutOptimization(category);
    });
  }
  
  /**
   * Rebuild a batch without optimization (1 tile = 1 instance)
   * Each tile gets its own instance in the InstancedMesh
   */
  private rebuildBatchWithoutOptimization(category: AssetCategory): void {
    const batch = this.getOrCreateBatch(category);
    const gridSize = this.gridSystem.getGridSize();
    
    // Clear existing rendered state completely
    batch.instances.clear();
    batch.mesh.count = 0;
    batch.freeIndices = [];
    
    // Get all tiles for this category from logical layout
    const tilesForCategory: Array<{objectId: string, position: GridPosition}> = [];
    this.logicalTiles.forEach((tile, objectId) => {
      if (tile.category === category) {
        tilesForCategory.push({ objectId, position: tile.position });
      }
    });
    
    // Create one instance per tile (no optimization)
    tilesForCategory.forEach(({ objectId, position }) => {
      const instanceIndex = this.allocateInstanceIndex(batch);
      
      // Convert grid position to world position (center of cell)
      // Use same approach as addTileInternal - gridToWorld returns corner, add gridSize/2 to center
      const worldPos = this.gridSystem.gridToWorld(position);
      const centerX = worldPos.x + gridSize / 2;
      const centerZ = worldPos.z + gridSize / 2;
      
      // Set position (center in grid cell)
      this.tempPosition.set(centerX, 0, centerZ);
      
      // No scaling - each instance is exactly one grid cell
      this.tempScale.set(1, 1, 1);
      this.tempQuaternion.identity();
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
      
      // Store mapping: objectId -> instanceIndex and position
      batch.instances.set(objectId, {
        instanceIndex,
        position: { x: position.x, z: position.z, y: 0 },
        category,
      });
    });
    
    // Ensure count is correct
    const expectedCount = tilesForCategory.length;
    if (batch.mesh.count !== expectedCount) {
      batch.mesh.count = expectedCount;
    }
    
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.mesh.frustumCulled = this.frustumCullingEnabled;
  }
  
  /**
   * Allocate instance index (helper for optimization)
   */
  private allocateInstanceIndex(batch: TileBatch): number {
    let index: number;
    if (batch.freeIndices.length > 0) {
      index = batch.freeIndices.pop()!;
    } else {
      index = batch.mesh.count;
      batch.mesh.count++;
      if (batch.mesh.count >= batch.maxCount) {
        this.growBatch(batch);
      }
    }
    return index;
  }
}

