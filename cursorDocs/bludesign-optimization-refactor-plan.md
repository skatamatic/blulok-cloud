    q# BluDesign Optimization System - Refactoring Plan

## Problem Statement

The current optimization system mixes **logical layout** (what the user has placed) with **rendered layout** (how it's optimized and drawn). This causes:
- Flickering when tiles are added
- Tiles disappearing after optimization
- Complex "preserve instances" hacks
- Difficult to maintain and debug
- No clean separation of concerns

## Proposed Architecture

### 1. **Logical Layout (Source of Truth)**

A pure data structure representing what the user has placed:
```typescript
// In GroundTileManager
private logicalTiles: Map<string, {position: GridPosition, category: AssetCategory}> = new Map();
```

This is:
- The single source of truth for what tiles exist
- Modified only by `addTile()` and `removeTile()`
- Used by `getOptimizationContexts()` to provide data to the optimizer
- Independent of rendering/optimization state

### 2. **Optimization Manager**

Responsible for:
- Watching logical layout via `getOptimizationContexts()`
- Automatically triggering re-optimization when logical data changes
- Caching optimization results
- **Never touches rendering directly**

### 3. **Rendered Layout (Pure Renderer)**

GroundTileManager becomes a pure renderer:
- `addTile()` / `removeTile()`: Only update `logicalTiles`, trigger optimization request
- `getOptimizationContexts()`: Reads from `logicalTiles`, provides cells to optimizer
- `onOptimizationComplete()`: Receives optimized result, rebuilds rendered batch from scratch
- When optimization disabled: Renders 1:1 from `logicalTiles` (no optimization pass)

## Key Changes

### GroundTileManager Changes

**Before:**
```typescript
// Mixed logical + rendered data
private batches: Map<AssetCategory, TileBatch> = new Map();
// TileBatch contains instances Map that serves dual purpose

addTile(objectId, category, position) {
  // Immediately renders to batch.mesh
  // Adds to batch.instances (used as logical storage)
  // Requests optimization
}

getOptimizationContexts() {
  // Reads from batch.instances (rendered state)
  // Problem: includes newly added tiles that haven't been optimized yet
}

onOptimizationComplete(result) {
  // Tries to preserve instances not in result (hack)
  // Complex logic to merge optimized + unoptimized
}
```

**After:**
```typescript
// Separate logical data store
private logicalTiles: Map<string, {position: GridPosition, category: AssetCategory}> = new Map();

// Rendered batches (pure rendering state)
private batches: Map<AssetCategory, TileBatch> = new Map();

addTile(objectId, category, position) {
  // 1. Update logical layout (source of truth)
  this.logicalTiles.set(objectId, {position, category});
  
  // 2. Request optimization (will trigger full re-render)
  this.optimizationManager.requestOptimization(`ground-tile-${category}`);
  
  // 3. If optimization disabled, render immediately (1:1 mapping)
  if (!this.optimizationManager.isEnabled()) {
    this.renderTileDirectly(objectId, category, position);
  }
}

getOptimizationContexts() {
  // Read ONLY from logicalTiles (clean source of truth)
  // Group by category, convert to cells array
  const contexts: OptimizationContext[] = [];
  
  const tilesByCategory = new Map<AssetCategory, Array<{x: number, z: number}>>();
  this.logicalTiles.forEach((tile, objectId) => {
    if (!tilesByCategory.has(tile.category)) {
      tilesByCategory.set(tile.category, []);
    }
    tilesByCategory.get(tile.category)!.push({x: tile.position.x, z: tile.position.z});
  });
  
  tilesByCategory.forEach((cells, category) => {
    contexts.push({
      id: `ground-tile-${category}`,
      cells,
      options: {...},
      metadata: {category}
    });
  });
  
  return contexts;
}

onOptimizationComplete(contextId, result) {
  // Extract category
  const category = /* extract from contextId */;
  
  // Build objectId -> cellKey mapping from logicalTiles
  const cellToObjectId = new Map<string, string>();
  this.logicalTiles.forEach((tile, objectId) => {
    if (tile.category === category) {
      const cellKey = `${tile.position.x},${tile.position.z}`;
      cellToObjectId.set(cellKey, objectId);
    }
  });
  
  // Rebuild rendered batch COMPLETELY from optimized result
  this.rebuildBatchFromOptimization(category, result, cellToObjectId);
}

rebuildBatchFromOptimization(category, result, cellToObjectId) {
  const batch = this.getOrCreateBatch(category);
  
  // Clear everything
  batch.instances.clear();
  batch.mesh.count = 0;
  batch.freeIndices = [];
  
  // Rebuild from optimization result (all tiles are covered by rectangles)
  result.rectangles.forEach(rect => {
    const instanceIndex = this.allocateInstanceIndex(batch);
    
    // Calculate rectangle center and size
    const centerX = (rect.minX + rect.maxX + 1) * gridSize / 2;
    const centerZ = (rect.minZ + rect.maxZ + 1) * gridSize / 2;
    const width = (rect.maxX - rect.minX + 1) * gridSize;
    const depth = (rect.maxZ - rect.minZ + 1) * gridSize;
    
    // Set instance matrix
    this.tempPosition.set(centerX, 0, centerZ);
    this.tempScale.set(width / (gridSize * 0.98), 1, depth / (gridSize * 0.98));
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    batch.mesh.setMatrixAt(instanceIndex, this.tempMatrix);
    
    // Map all cells in rectangle to their objectIds
    rect.cells.forEach(cellKey => {
      const objectId = cellToObjectId.get(cellKey);
      if (objectId) {
        // Parse cell coordinates
        const [cellX, cellZ] = cellKey.split(',').map(Number);
        
        // Store mapping (for removeTile to work)
        batch.instances.set(objectId, {
          instanceIndex,
          position: {x: cellX, z: cellZ, y: 0},
          category,
        });
      }
    });
  });
  
  batch.mesh.instanceMatrix.needsUpdate = true;
}
```

### Key Benefits

1. **No Race Conditions**: Logical layout is always the source of truth
2. **No Preserving Hacks**: Complete rebuild from optimized result
3. **Clean Separation**: Logical data separate from rendered data
4. **Predictable Behavior**: Optimization always sees full logical state
5. **Easier Testing**: Can test logical operations without rendering
6. **Easier Debugging**: Clear separation makes issues obvious

### Migration Steps

1. Add `logicalTiles` Map to GroundTileManager
2. Update `addTile()` to update `logicalTiles` first
3. Update `removeTile()` to remove from `logicalTiles`
4. Update `getOptimizationContexts()` to read from `logicalTiles`
5. Simplify `onOptimizationComplete()` to do complete rebuild
6. Remove "preserve instances" logic
7. Add fallback rendering for when optimization is disabled
8. Test thoroughly

## Implementation Notes

- When optimization is disabled, we can render directly from `logicalTiles` (1:1 mapping, no optimization pass)
- The optimization result should cover ALL cells in `logicalTiles` (validation ensures this)
- `batch.instances` becomes purely a rendering concern (objectId -> instanceIndex mapping for removal)
- No need to preserve instances - optimization always sees full state via `getOptimizationContexts()`

