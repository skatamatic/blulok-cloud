/**
 * Cross-floor object cloning: copy contents when adding a floor and propagate vertical shafts.
 * Orchestration stays out of {@link BluDesignEngine} — the engine supplies scene/history hooks via {@link FloorReplicationPort}.
 */

import type { AssetMetadata, PlacedObject } from '../types';
import { adjustDisplayNameForFloor, generatePlacementObjectId } from './floorObjectHelpers';

export interface FloorReplicationPort {
  listObjectIds(): string[];
  getObjectData(id: string): PlacedObject | undefined;
  placeFromReplication(placedObject: PlacedObject, asset: AssetMetadata): void;
  emitObjectPlaced(placedObject: PlacedObject): void;
  historyPushBatch(objects: PlacedObject[]): void;
  historyPushPlace(placedObject: PlacedObject): void;
}

export class FloorObjectReplication {
  constructor(private readonly port: FloorReplicationPort) {}

  /**
   * Copy all non–vertical-shaft objects from sourceFloor to targetFloor.
   */
  copyNonShaftContents(sourceFloor: number, targetFloor: number): void {
    const objectsToCopy: PlacedObject[] = [];

    for (const id of this.port.listObjectIds()) {
      const objData = this.port.getObjectData(id);
      if (!objData) continue;
      if (objData.floor !== sourceFloor) continue;
      if (objData.verticalShaftId) continue;
      objectsToCopy.push(objData);
    }

    const placedCopies: PlacedObject[] = [];

    for (const sourceObj of objectsToCopy) {
      const asset = sourceObj.assetMetadata;
      if (!asset) continue;

      const newObject: PlacedObject = {
        ...sourceObj,
        id: generatePlacementObjectId(),
        floor: targetFloor,
        name: sourceObj.name
          ? adjustDisplayNameForFloor(sourceObj.name, targetFloor)
          : sourceObj.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.port.placeFromReplication(newObject, asset);
      placedCopies.push(newObject);
      this.port.emitObjectPlaced(newObject);
    }

    if (placedCopies.length > 0) {
      this.port.historyPushBatch(placedCopies);
    }
  }

  /**
   * For each vertical shaft group, place a counterpart on newLevel if missing.
   */
  addVerticalShaftsToNewFloor(newLevel: number): void {
    const allIds = this.port.listObjectIds();
    const verticalShaftObjects = new Map<string, PlacedObject>();

    for (const id of allIds) {
      const objData = this.port.getObjectData(id);
      if (!objData || !objData.verticalShaftId || objData.disableVerticalShaft) continue;

      const shaftId = objData.verticalShaftId;
      if (!verticalShaftObjects.has(shaftId)) {
        verticalShaftObjects.set(shaftId, objData);
      }
    }

    for (const [shaftId, sourceObj] of verticalShaftObjects) {
      const asset = sourceObj.assetMetadata;
      if (!asset) continue;

      let existingOnFloor = false;
      for (const objId of allIds) {
        const data = this.port.getObjectData(objId);
        if (data?.verticalShaftId === shaftId && data?.floor === newLevel) {
          existingOnFloor = true;
          break;
        }
      }

      if (existingOnFloor) continue;

      const newObject: PlacedObject = {
        ...sourceObj,
        id: generatePlacementObjectId(),
        floor: newLevel,
        verticalShaftId: shaftId,
        name: sourceObj.name
          ? adjustDisplayNameForFloor(sourceObj.name, newLevel)
          : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.port.placeFromReplication(newObject, asset);
      this.port.historyPushPlace(newObject);
      this.port.emitObjectPlaced(newObject);
    }
  }
}
