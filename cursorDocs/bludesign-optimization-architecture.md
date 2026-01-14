# BluDesign Optimization System - Architecture

## Overview

The optimization system in BluDesign separates **logical layout** (what the user has placed) from **rendered layout** (how it's optimized and drawn). This clean separation ensures:

- ✅ No race conditions
- ✅ Predictable behavior  
- ✅ Easy to maintain and debug
- ✅ Automatic re-optimization on changes

## Architecture Components

### 1. Logical Layout (Source of Truth)

**Location**: `GroundTileManager.logicalTiles`

```typescript
private logicalTiles: Map<string, {position: GridPosition, category: AssetCategory}> = new Map();
```

**Purpose**: 
- Single source of truth for what tiles exist
- Modified only by `addTile()` and `removeTile()`
- Used by `getOptimizationContexts()` to provide data to optimizer
- Independent of rendering/optimization state

### 2. Optimization Manager

**Location**: `OptimizationManager` (singleton)

**Responsibilities**:
- Watches logical layout via `getOptimizationContexts()`
- Automatically triggers re-optimization when logical data changes
- Caches optimization results
- Never touches rendering directly

**Key Methods**:
- `requestOptimization(contextId)`: Request optimization (debounced)
- `optimizeContext(context)`: Run optimization, return result
- `registerClient(client)`: Register a manager that needs optimization

### 3. Rendered Layout (Pure Renderer)

**Location**: `GroundTileManager.batches`

**Purpose**:
- Contains `InstancedMesh` batches for rendering
- Completely rebuilt from optimization results
- No knowledge of logical layout (except for objectId mapping)

**Key Methods**:
- `rebuildBatchFromOptimization()`: Complete rebuild from optimized result
- `onOptimizationComplete()`: Called when optimization completes, triggers rebuild

## Data Flow

### Adding a Tile

```
1. User places tile
   ↓
2. addTile(objectId, category, position)
   - Updates logicalTiles.set(objectId, {position, category})
   - Requests optimization: optimizationManager.requestOptimization(...)
   ↓
3. Optimization Manager (debounced)
   - Calls getOptimizationContexts() → reads from logicalTiles
   - Runs GeometryOptimizer.optimize()
   - Calls onOptimizationComplete(result)
   ↓
4. onOptimizationComplete(result)
   - Builds cellToObjectId from logicalTiles
   - Calls rebuildBatchFromOptimization()
   ↓
5. rebuildBatchFromOptimization()
   - Clears batch completely
   - Rebuilds from optimization result (rectangles)
   - Maps objectIds to instance indices
```

### Removing a Tile

```
1. User removes tile
   ↓
2. removeTile(objectId)
   - Removes from logicalTiles.delete(objectId)
   - Requests optimization: optimizationManager.requestOptimization(...)
   ↓
3. Optimization Manager (same flow as adding)
   - Reads updated logicalTiles (tile no longer present)
   - Optimizes remaining tiles
   - Rebuilds rendered batch
```

## Key Benefits

1. **No Race Conditions**: Logical layout is always the source of truth
2. **No Preserving Hacks**: Complete rebuild from optimized result
3. **Clean Separation**: Logical data separate from rendered data
4. **Predictable Behavior**: Optimization always sees full logical state
5. **Easier Testing**: Can test logical operations without rendering
6. **Easier Debugging**: Clear separation makes issues obvious

## Implementation Details

### GroundTileManager Methods

**addTile()**:
```typescript
addTile(objectId, category, position) {
  // 1. Update logical layout
  this.logicalTiles.set(objectId, {position, category});
  
  // 2. Request optimization (will trigger re-render)
  this.optimizationManager.requestOptimization(`ground-tile-${category}`);
  
  // 3. Return marker for selection/raycasting
  return marker;
}
```

**getOptimizationContexts()**:
```typescript
getOptimizationContexts() {
  // Read ONLY from logicalTiles (clean source of truth)
  const tilesByCategory = new Map();
  this.logicalTiles.forEach((tile) => {
    // Group by category, convert to cells array
  });
  return contexts;
}
```

**onOptimizationComplete()**:
```typescript
onOptimizationComplete(contextId, result) {
  // Build cellToObjectId from logicalTiles
  const cellToObjectId = new Map();
  this.logicalTiles.forEach((tile, objectId) => {
    if (tile.category === category) {
      const cellKey = `${tile.position.x},${tile.position.z}`;
      cellToObjectId.set(cellKey, objectId);
    }
  });
  
  // Rebuild rendered batch completely
  this.rebuildBatchFromOptimization(category, result, cellToObjectId);
}
```

**rebuildBatchFromOptimization()**:
```typescript
rebuildBatchFromOptimization(category, result, cellToObjectId) {
  // Clear everything
  batch.instances.clear();
  batch.mesh.count = 0;
  
  // Rebuild from optimization result
  result.rectangles.forEach(rect => {
    // Create instance for rectangle
    // Map all cells to their objectIds
  });
}
```

## When Optimization is Disabled

When optimization is disabled, the system should render directly from `logicalTiles` (1:1 mapping, no optimization pass). This is a future enhancement.

## Related Files

- `frontend/src/components/bludesign/core/GroundTileManager.ts`: Logical layout + rendering
- `frontend/src/components/bludesign/core/OptimizationManager.ts`: Centralized optimization
- `frontend/src/components/bludesign/core/utils/GeometryOptimizer.ts`: Pure optimization algorithm
- `frontend/src/components/bludesign/core/utils/OptimizationClient.ts`: Interface for optimization clients

## Future Enhancements

1. Support for disabling optimization (render 1:1 from logical layout)
2. Incremental optimization (only optimize changed areas)
3. Optimization analytics/visualization
4. Performance improvements to GeometryOptimizer algorithm

