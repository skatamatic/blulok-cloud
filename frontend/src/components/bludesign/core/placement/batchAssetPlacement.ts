import * as THREE from 'three';
import { OptimizationManager } from '../OptimizationManager';
import type { AssetCategory, AssetMetadata, GridPosition, PlacedObject } from '../types';

const LARGE_BATCH_THRESHOLD = 100;
const OPTIMIZATION_CELL_THRESHOLD = 500;
const GROUND_TILE_BATCH_YIELD = 50;

/**
 * Subsystems used by {@link runBatchAssetPlacement} (wired from `BluDesignEngine`).
 */
export interface BatchAssetPlacementDependencies {
  groundTileManager: {
    isGroundTileCategory(category: AssetCategory): boolean;
    getTileIds(category: AssetCategory): string[];
    addTilesBatch(
      tiles: Array<{ objectId: string; category: AssetCategory; position: GridPosition }>
    ): THREE.Object3D[];
    removeTile(id: string): void;
  };
  sceneManager: {
    addObject(
      id: string,
      mesh: THREE.Object3D,
      data: PlacedObject,
      options?: { trackOnly?: boolean }
    ): void;
    removeObject(id: string): void;
  };
  gridSystem: {
    markOccupied(
      objectId: string,
      gridPos: GridPosition,
      size: { x: number; z: number },
      canStack: boolean,
      category?: AssetCategory | string,
      floor?: number
    ): string | null;
  };
  placementCoordinator: {
    placeBatchNonGroundMesh(placedObject: PlacedObject, asset: AssetMetadata): void;
  };
  scene: THREE.Scene;
  actionHistory: {
    pushBatchPlace(objects: PlacedObject[]): void;
  };
  emitProgressUpdated(payload: {
    percentage: number;
    message: string;
    operation: 'processing';
  }): void;
  emitProgressComplete(payload: { operation: 'processing' }): void;
  emitObjectsPlaced(objects: PlacedObject[]): void;
  scheduleAutoSave(): void;
}

/**
 * Batch placement for ground tiles and non-ground assets (e.g. paste / fill).
 * Records a single undo batch and mirrors legacy `BluDesignEngine.handleBatchAssetPlaced` behavior.
 */
export async function runBatchAssetPlacement(
  objects: PlacedObject[],
  asset: AssetMetadata,
  deps: BatchAssetPlacementDependencies
): Promise<void> {
  if (objects.length === 0) return;

  const groundTiles: PlacedObject[] = [];
  const otherObjects: PlacedObject[] = [];

  for (const placedObject of objects) {
    if (deps.groundTileManager.isGroundTileCategory(placedObject.assetMetadata.category)) {
      groundTiles.push(placedObject);
    } else {
      otherObjects.push(placedObject);
    }
  }

  let willOptimizeWithProgress = false;
  const optimizationManager = OptimizationManager.getInstance();
  if (optimizationManager.isEnabled() && groundTiles.length > 0) {
    const tilesByCategory = new Map<AssetCategory, number>();
    groundTiles.forEach((tile) => {
      const count = tilesByCategory.get(tile.assetMetadata.category) || 0;
      tilesByCategory.set(tile.assetMetadata.category, count + 1);
    });

    tilesByCategory.forEach((newCount, category) => {
      const existingIds = deps.groundTileManager.getTileIds(category);
      const totalCells = existingIds.length + newCount;
      if (totalCells >= OPTIMIZATION_CELL_THRESHOLD) {
        willOptimizeWithProgress = true;
      }
    });
  }

  const shouldShowProgress = objects.length >= LARGE_BATCH_THRESHOLD || willOptimizeWithProgress;

  if (shouldShowProgress) {
    deps.emitProgressUpdated({
      percentage: 0,
      message: `Placing ${objects.length} items...`,
      operation: 'processing',
    });
  }

  const totalItems = groundTiles.length + otherObjects.length;
  let processedItems = 0;

  if (groundTiles.length > 0) {
    const tileData = groundTiles.map((obj) => ({
      objectId: obj.id,
      category: obj.assetMetadata.category,
      position: obj.position,
    }));

    const markers = deps.groundTileManager.addTilesBatch(tileData);

    for (let i = 0; i < groundTiles.length; i++) {
      const placedObject = groundTiles[i];
      const marker = markers[i];

      deps.sceneManager.addObject(placedObject.id, marker, placedObject, { trackOnly: true });

      const size = { x: placedObject.assetMetadata.gridUnits.x, z: placedObject.assetMetadata.gridUnits.z };
      const replacedGroundId = deps.gridSystem.markOccupied(
        placedObject.id,
        placedObject.position,
        size,
        placedObject.assetMetadata.canStack,
        placedObject.assetMetadata.category,
        placedObject.floor ?? 0
      );

      if (replacedGroundId) {
        deps.groundTileManager.removeTile(replacedGroundId);
        deps.sceneManager.removeObject(replacedGroundId);
      }

      processedItems++;

      if (shouldShowProgress && (i % GROUND_TILE_BATCH_YIELD === GROUND_TILE_BATCH_YIELD - 1 || i === groundTiles.length - 1)) {
        const progress = Math.round((processedItems / totalItems) * 30);
        deps.emitProgressUpdated({
          percentage: progress,
          message: `Placing ${processedItems} of ${totalItems} items...`,
          operation: 'processing',
        });

        if (i < groundTiles.length - 1) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          });
        }
      }
    }
  }

  for (const placedObject of otherObjects) {
    deps.placementCoordinator.placeBatchNonGroundMesh(placedObject, asset);

    processedItems++;
    if (shouldShowProgress && processedItems % 10 === 0) {
      const progress = Math.round((processedItems / totalItems) * 30);
      deps.emitProgressUpdated({
        percentage: progress,
        message: `Placing ${processedItems} of ${totalItems} items...`,
        operation: 'processing',
      });
    }
  }

  if (shouldShowProgress) {
    const om = OptimizationManager.getInstance();
    const willShowProgress = om.willShowOptimizationProgress();

    if (willShowProgress) {
      deps.emitProgressUpdated({
        percentage: 30,
        message: 'Optimizing geometry...',
        operation: 'processing',
      });
    } else {
      deps.emitProgressUpdated({
        percentage: 100,
        message: 'Complete',
        operation: 'processing',
      });
      setTimeout(() => {
        deps.emitProgressComplete({ operation: 'processing' });
      }, 200);
    }
  }

  deps.actionHistory.pushBatchPlace(objects);
  deps.emitObjectsPlaced(objects);
  deps.scheduleAutoSave();
}
