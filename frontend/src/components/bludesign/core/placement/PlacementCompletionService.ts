import * as THREE from 'three';
import type { Building, AssetMetadata, PlacedObject } from '../types';
import { OptimizationManager } from '../OptimizationManager';
import { runBatchAssetPlacement } from './batchAssetPlacement';
import { isSmartAssetCategory, nextNumberedAssetDisplayName } from './smartAssetHelpers';
import type { PlacedObjectPlacementCoordinator } from './PlacedObjectPlacementCoordinator';
import type { ActionHistory } from '../ActionHistory';
import type { GroundTileManager } from '../GroundTileManager';
import type { SceneManager } from '../SceneManager';
import type { GridSystem } from '../GridSystem';
import type { FloorManager } from '../FloorManager';
import type { BuildingManager } from '../BuildingManager';

export type PlacementCompletionStateSlice = {
  isFloorMode: boolean;
  buildings: Building[];
};

export type PlacementCompletionServiceDeps = {
  getStateSlice: () => PlacementCompletionStateSlice;
  getCurrentPlacementAsset: () => AssetMetadata | null;
  setStateBuildings: (buildings: Building[]) => void;
  /** Enter floor mode at ground floor after a new building exists (mirrors engine). */
  afterNewBuildingCreated: () => void;
  cancelPlacement: () => void;
  placementCoordinator: PlacedObjectPlacementCoordinator;
  scene: THREE.Scene;
  sceneManager: SceneManager;
  gridSystem: GridSystem;
  groundTileManager: GroundTileManager;
  buildingManager: BuildingManager;
  floorManager: FloorManager;
  actionHistory: ActionHistory;
  emitObjectPlaced: (o: PlacedObject) => void;
  emitProgressUpdated: (payload: unknown) => void;
  emitProgressComplete: (payload: unknown) => void;
  emitObjectsPlaced: (objects: PlacedObject[]) => void;
  emitStateUpdated: () => void;
  scheduleAutoSave: () => void;
};

const BUILDING_CELL_THRESHOLD = 500;

/**
 * Interactive placement completion: single asset, vertical shaft, batch tiles, new building footprint.
 */
export class PlacementCompletionService {
  private readonly objectNameCounters = new Map<string, number>();

  constructor(private readonly deps: PlacementCompletionServiceDeps) {}

  placeSingleObject(placedObject: PlacedObject, asset: AssetMetadata): void {
    if (!placedObject.name && isSmartAssetCategory(asset.category)) {
      placedObject.name = nextNumberedAssetDisplayName(
        asset.id,
        asset.name,
        this.objectNameCounters
      );
    }
    this.deps.placementCoordinator.placeInteractiveSingle(placedObject, asset);
  }

  handleAssetPlaced(placedObject: PlacedObject): void {
    const slice = this.deps.getStateSlice();
    if (!slice.isFloorMode && slice.buildings.length > 0) {
      console.warn(
        'Cannot place assets in full building view. Switch to a specific floor first.'
      );
      this.deps.cancelPlacement();
      return;
    }

    const asset = this.deps.getCurrentPlacementAsset();
    if (!asset) {
      console.error('No active placement asset');
      return;
    }

    if (asset.spansAllFloors && slice.buildings.length > 0) {
      this.handleVerticalShaftPlacement(placedObject, asset);
      return;
    }

    this.placeSingleObject(placedObject, asset);
    this.deps.actionHistory.pushPlace(placedObject);
    this.deps.emitObjectPlaced(placedObject);
    this.deps.scheduleAutoSave();
  }

  private handleVerticalShaftPlacement(
    placedObject: PlacedObject,
    asset: AssetMetadata
  ): void {
    const buildings = this.deps.getStateSlice().buildings;
    if (buildings.length === 0) return;

    const building = buildings[0];
    const floors = building.floors || [];

    if (floors.length === 0) {
      this.placeSingleObject(placedObject, asset);
      this.deps.actionHistory.pushPlace(placedObject);
      this.deps.emitObjectPlaced(placedObject);
      this.deps.scheduleAutoSave();
      return;
    }

    const verticalShaftId = `shaft-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const floorsToPlace = floors;
    const placedObjects: PlacedObject[] = [];

    for (const floor of floorsToPlace) {
      const floorObject: PlacedObject = {
        ...placedObject,
        id:
          floor.level === placedObject.floor
            ? placedObject.id
            : `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        floor: floor.level,
        verticalShaftId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (isSmartAssetCategory(asset.category)) {
        const baseName = nextNumberedAssetDisplayName(
          asset.id,
          asset.name,
          this.objectNameCounters
        );
        floorObject.name =
          floors.length > 1 ? `${baseName} (F${floor.level})` : baseName;
      }

      this.placeSingleObject(floorObject, asset);
      placedObjects.push(floorObject);
    }

    if (placedObjects.length > 0) {
      this.deps.actionHistory.pushBatchPlace(placedObjects);
      for (const obj of placedObjects) {
        this.deps.emitObjectPlaced(obj);
      }
      this.deps.scheduleAutoSave();
    }
  }

  async handleBatchAssetPlaced(objects: PlacedObject[]): Promise<void> {
    if (objects.length === 0) return;
    const asset = this.deps.getCurrentPlacementAsset();
    if (!asset) {
      console.error('No active placement asset');
      return;
    }

    await runBatchAssetPlacement(objects, asset, {
      groundTileManager: this.deps.groundTileManager,
      sceneManager: this.deps.sceneManager,
      gridSystem: this.deps.gridSystem,
      placementCoordinator: this.deps.placementCoordinator,
      scene: this.deps.scene,
      actionHistory: this.deps.actionHistory,
      emitProgressUpdated: (payload) => this.deps.emitProgressUpdated(payload),
      emitProgressComplete: (payload) => this.deps.emitProgressComplete(payload),
      emitObjectsPlaced: (placed) => this.deps.emitObjectsPlaced(placed),
      scheduleAutoSave: () => this.deps.scheduleAutoSave(),
    });
  }

  async handleBuildingPlaced(footprint: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }): Promise<void> {
    const cellCount =
      (footprint.maxX - footprint.minX + 1) *
      (footprint.maxZ - footprint.minZ + 1);

    const optimizationManager = OptimizationManager.getInstance();
    const willShowOptimizationProgress =
      optimizationManager.isEnabled() &&
      optimizationManager.willShowOptimizationProgress();
    const shouldShowProgress =
      cellCount >= BUILDING_CELL_THRESHOLD || willShowOptimizationProgress;

    if (shouldShowProgress) {
      this.deps.emitProgressUpdated({
        percentage: 0,
        message: 'Creating building...',
        operation: 'processing',
      });
    }

    const overlapping = this.deps.buildingManager.findOverlappingBuildings(
      footprint
    );

    let building: Building | undefined;
    if (overlapping.length > 0) {
      building = await this.deps.buildingManager.createBuilding(footprint);
      this.deps.buildingManager.mergeBuildings([...overlapping, building.id]);
      const buildings = this.deps.buildingManager.getAllBuildings();
      if (buildings.length > 0) {
        building = buildings[buildings.length - 1];
      }
    } else {
      building = await this.deps.buildingManager.createBuilding(footprint);
    }

    if (shouldShowProgress) {
      this.deps.emitProgressUpdated({
        percentage: 30,
        message: 'Optimizing geometry...',
        operation: 'processing',
      });

      if (!willShowOptimizationProgress) {
        this.deps.emitProgressUpdated({
          percentage: 100,
          message: 'Complete',
          operation: 'processing',
        });
        setTimeout(() => {
          this.deps.emitProgressComplete({ operation: 'processing' });
        }, 200);
      }
    }

    if (building) {
      this.deps.actionHistory.pushBuildingCreate(building);
      this.deps.setStateBuildings(this.deps.buildingManager.getAllBuildings());
    }

    this.deps.afterNewBuildingCreated();
    this.deps.emitStateUpdated();
    this.deps.scheduleAutoSave();
  }
}
