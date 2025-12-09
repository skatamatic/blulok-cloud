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
const DEFAULT_COLORS = {
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
      const material = new THREE.MeshStandardMaterial({
        color: DEFAULT_COLORS[category] || '#808080',
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
      mesh.frustumCulled = false;
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
    for (const [category, batch] of this.batches) {
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
    this.clear();
    if (this.sharedGeometry) {
      this.sharedGeometry.dispose();
      this.sharedGeometry = null;
    }
  }
}

