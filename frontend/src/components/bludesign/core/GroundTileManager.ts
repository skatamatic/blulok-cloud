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
import {
  GeometryOptimizer,
  OptimizationResult,
} from './utils/GeometryOptimizer';

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

export class GroundTileManager {
  private scene: THREE.Scene;
  private gridSystem: GridSystem;
  
  // Batches by category
  private batches: Map<AssetCategory, TileBatch> = new Map();
  
  // Shared geometry (all ground tiles are the same shape)
  private sharedGeometry: THREE.BoxGeometry | null = null;
  
  // Temp objects for matrix calculations
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3(1, 1, 1);
  
  // Configuration
  private readonly TILE_HEIGHT = 0.05;
  private readonly INITIAL_CAPACITY = 500;
  
  // Optimizer state
  private optimizerEnabled: boolean = true;
  private isReadonly: boolean = false;
  private frustumCullingEnabled: boolean = true;
  private useInstancing: boolean = true;
  // Store optimizations per category (for future batch optimization)
  private categoryOptimizations: Map<AssetCategory, OptimizationResult> = new Map();
  
  // Auto-optimization debounce
  private optimizeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCategories: Set<AssetCategory> = new Set();
  private readonly OPTIMIZE_DEBOUNCE_MS = 500;
  
  constructor(scene: THREE.Scene, gridSystem: GridSystem) {
    this.scene = scene;
    this.gridSystem = gridSystem;
    this.initializeSharedGeometry();
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
      mesh.receiveShadow = true;
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
   * Add a ground tile instance
   * Returns a marker object for selection/interaction
   */
  addTile(
    objectId: string,
    category: AssetCategory,
    position: GridPosition
  ): THREE.Object3D {
    const batch = this.getOrCreateBatch(category);
    const gridSize = this.gridSystem.getGridSize();
    
    // Allocate instance index (reuse freed slots when possible)
    let instanceIndex: number;
    if (batch.freeIndices.length > 0) {
      instanceIndex = batch.freeIndices.pop()!;
    } else {
      instanceIndex = batch.mesh.count;
      batch.mesh.count++;
    }
    
    // Grow if needed
    if (batch.mesh.count > batch.maxCount) {
      this.growBatch(batch);
    }
    
    // Calculate world position
    const worldPos = this.gridSystem.gridToWorld(position);
    this.tempPosition.set(
      worldPos.x + gridSize / 2, // Center in grid cell
      0, // Ground level
      worldPos.z + gridSize / 2
    );
    
    // Set instance matrix
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
    batch.mesh.instanceMatrix.needsUpdate = true;
    
    // Track instance
    batch.instances.set(objectId, {
      instanceIndex,
      position,
      category,
    });
    
    // Schedule auto-optimization for this category (if enabled)
    if (this.optimizerEnabled) {
      this.scheduleAutoOptimization(category);
    }
    
    // Create invisible marker for selection/raycasting
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(gridSize * 0.98, this.TILE_HEIGHT, gridSize * 0.98),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    marker.position.copy(this.tempPosition);
    marker.userData.id = objectId;
    marker.userData.isGroundTile = true;
    marker.userData.category = category;
    marker.userData.gridPosition = position;
    marker.userData.selectable = true;
    marker.userData.instanceBatch = category;
    marker.userData.instanceIndex = instanceIndex;
    
    // Don't add marker to scene - just return it for tracking
    return marker;
  }
  
  /**
   * Remove a ground tile instance
   */
  removeTile(objectId: string): boolean {
    for (const [, batch] of this.batches) {
      const instance = batch.instances.get(objectId);
      if (instance) {
        // Move instance to "infinity" (hidden)
        this.tempMatrix.makeTranslation(99999, 99999, 99999);
        batch.mesh.setMatrixAt(instance.instanceIndex, this.tempMatrix);
        batch.mesh.instanceMatrix.needsUpdate = true;
        
        // Add to free list
        batch.freeIndices.push(instance.instanceIndex);
        batch.instances.delete(objectId);
        
        return true;
      }
    }
    return false;
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
   * Get tile instance data
   */
  getTileInstance(objectId: string): TileInstance | undefined {
    for (const batch of this.batches.values()) {
      const instance = batch.instances.get(objectId);
      if (instance) return instance;
    }
    return undefined;
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
    newMesh.frustumCulled = false;
    newMesh.receiveShadow = true;
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
   * Get all tile IDs for a category
   */
  getTileIds(category: AssetCategory): string[] {
    const batch = this.batches.get(category);
    if (!batch) return [];
    return Array.from(batch.instances.keys());
  }
  
  /**
   * Get total tile count
   */
  getTotalCount(): number {
    let total = 0;
    for (const batch of this.batches.values()) {
      total += batch.instances.size;
    }
    return total;
  }
  
  /**
   * Clear all tiles
   */
  clear(): void {
    for (const batch of this.batches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
      batch.material.dispose();
    }
    this.batches.clear();
  }
  
  /**
   * Dispose all resources
   */
  dispose(): void {
    // Clear optimization timer
    if (this.optimizeTimer) {
      clearTimeout(this.optimizeTimer);
      this.optimizeTimer = null;
    }
    this.pendingCategories.clear();
    
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
   */
  setOptimizerEnabled(enabled: boolean): void {
    if (this.optimizerEnabled === enabled) return;
    
    this.optimizerEnabled = enabled;
    
    if (enabled) {
      // If enabling, optimize all categories immediately
      this.optimizeAllCategories();
    } else {
      // If disabling, invalidate optimizations (but keep current rendering)
      this.categoryOptimizations.clear();
      // Clear any pending optimization
      if (this.optimizeTimer) {
        clearTimeout(this.optimizeTimer);
        this.optimizeTimer = null;
      }
      this.pendingCategories.clear();
    }
  }
  
  /**
   * Set readonly mode (affects optimization aggressiveness)
   */
  setReadonlyMode(readonly: boolean): void {
    if (this.isReadonly === readonly) return;
    this.isReadonly = readonly;
    // Invalidate optimizations to rebuild with new strategy
    this.categoryOptimizations.clear();
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
   */
  optimizeCategory(category: AssetCategory): void {
    if (!this.optimizerEnabled) return;
    
    const batch = this.batches.get(category);
    if (!batch || batch.instances.size === 0) return;
    
    // Collect all cell positions and their original object IDs
    const cells: Array<{x: number, z: number}> = [];
    const cellToObjectId = new Map<string, string>(); // "x,z" -> objectId
    
    batch.instances.forEach((instance, objectId) => {
      const cellKey = `${instance.position.x},${instance.position.z}`;
      cells.push({ x: instance.position.x, z: instance.position.z });
      cellToObjectId.set(cellKey, objectId);
    });
    
    if (cells.length === 0) return;
    
    // Optimize
    const result = GeometryOptimizer.optimize(cells, {
      readonly: this.isReadonly,
      maxRectangleSize: this.isReadonly ? undefined : 50,
    });
    
    // Validate
    if (!GeometryOptimizer.validateResult(cells, result)) {
      console.error('[GroundTileManager] Optimization validation failed');
      return;
    }
    
    // Store optimization with object ID mapping
    this.categoryOptimizations.set(category, result);
    
    // Rebuild batch with optimized rectangles, preserving original object IDs
    this.rebuildBatchWithOptimization(category, result, cellToObjectId);
  }
  
  /**
   * Rebuild a batch using optimized rectangles
   * Preserves original object IDs for selection/removal
   */
  private rebuildBatchWithOptimization(
    category: AssetCategory,
    optimization: OptimizationResult,
    cellToObjectId: Map<string, string>
  ): void {
    const batch = this.batches.get(category);
    if (!batch) return;
    
    const gridSize = this.gridSystem.getGridSize();
    
    // Store original instances before clearing (for lookup)
    const originalInstances = new Map(batch.instances);
    
    // Clear existing instances
    batch.instances.clear();
    batch.mesh.count = 0;
    batch.freeIndices = [];
    
    // Create instances for each rectangle
    optimization.rectangles.forEach((rect) => {
      const instanceIndex = this.allocateInstanceIndex(batch);
      
      // Calculate rectangle dimensions and center
      const width = (rect.maxX - rect.minX + 1) * gridSize;
      const depth = (rect.maxZ - rect.minZ + 1) * gridSize;
      const centerX = (rect.minX + rect.maxX + 1) * gridSize / 2;
      const centerZ = (rect.minZ + rect.maxZ + 1) * gridSize / 2;
      
      // Use scale in instance matrix
      this.tempPosition.set(centerX, 0, centerZ);
      this.tempScale.set(width / gridSize, 1, depth / gridSize);
      this.tempQuaternion.identity();
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
      
      // For each cell in this rectangle, preserve the original object ID
      // Use the first cell's object ID as the primary ID for this rectangle
      let primaryObjectId: string | null = null;
      for (const cellKey of rect.cells) {
        const objectId = cellToObjectId.get(cellKey);
        if (objectId) {
          if (!primaryObjectId) {
            primaryObjectId = objectId;
          }
          // Map all original object IDs to this instance index
          // This allows removeTile to work correctly
          batch.instances.set(objectId, {
            instanceIndex,
            position: { x: rect.minX, z: rect.minZ, y: 0 },
            category,
          });
        }
      }
    });
    
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.mesh.frustumCulled = this.frustumCullingEnabled;
  }
  
  /**
   * Schedule auto-optimization with debounce
   * Called automatically when tiles are added
   */
  private scheduleAutoOptimization(category: AssetCategory): void {
    if (!this.optimizerEnabled) return;
    
    this.pendingCategories.add(category);
    
    // Clear existing timer
    if (this.optimizeTimer) {
      clearTimeout(this.optimizeTimer);
    }
    
    // Schedule optimization after debounce period
    this.optimizeTimer = setTimeout(() => {
      this.pendingCategories.forEach(cat => {
        this.optimizeCategory(cat);
      });
      this.pendingCategories.clear();
      this.optimizeTimer = null;
    }, this.OPTIMIZE_DEBOUNCE_MS);
  }
  
  /**
   * Force immediate optimization of all categories
   * Useful after loading saved data
   */
  optimizeAllCategories(): void {
    // Clear any pending debounced optimization
    if (this.optimizeTimer) {
      clearTimeout(this.optimizeTimer);
      this.optimizeTimer = null;
    }
    this.pendingCategories.clear();
    
    // Optimize all categories that have tiles
    this.batches.forEach((batch, category) => {
      if (batch.instances.size > 0) {
        this.optimizeCategory(category);
      }
    });
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

