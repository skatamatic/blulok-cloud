import type {
  HistoryAction,
  PlaceActionData,
  DeleteActionData,
  MoveActionData,
  RotateActionData,
  BuildingCreateActionData,
  BuildingDeleteActionData,
  BuildingMoveActionData,
  FloorAddActionData,
  FloorDeleteActionData,
  FloorInsertActionData,
} from '../ActionHistory';
import type { Building, GridPosition, Orientation, PlacedObject } from '../types';

/** Same shape as `RotateActionData` state maps (explicit alias for tests / delegates). */
export type RotationStateMap = RotateActionData['beforeStates'];

/**
 * Engine callbacks for applying history without recording new history entries.
 * Implemented by `BluDesignEngine` via bound methods.
 */
export interface HistoryActionApplierDelegate {
  deleteObjectInternal(objectId: string): void;
  placeObjectInternal(placedObject: PlacedObject): void;
  moveObjectInternal(
    objectId: string,
    position: GridPosition,
    orientation: Orientation,
    rotation?: number,
    exactMeshPos?: { x: number; z: number }
  ): void;
  applyRotationState(states: RotationStateMap): void;

  removeBuildingInternal(buildingId: string): void;
  recreateBuildingInternal(building: Building): void;
  translateBuilding(buildingId: string, deltaX: number, deltaZ: number): void;
  /** Selection highlight refresh when the moved building is the active selection */
  onBuildingMoveSelectionSync(buildingId: string): void;

  undoFloorAdd(data: FloorAddActionData): void;
  redoFloorAdd(data: FloorAddActionData): void;
  undoFloorDelete(data: FloorDeleteActionData): void;
  redoFloorDelete(data: FloorDeleteActionData): void;
  undoFloorInsert(data: FloorInsertActionData): void;
  redoFloorInsert(data: FloorInsertActionData): void;

  emitStateUpdated(): void;
}

/**
 * Dispatches undo/redo for `HistoryAction` values (including nested batch actions).
 * Emits `state-updated` once per invocation (including each nested batch item), matching `BluDesignEngine` behavior.
 */
export class HistoryActionApplier {
  constructor(private readonly delegate: HistoryActionApplierDelegate) {}

  applyUndo(action: HistoryAction): void {
    switch (action.type) {
      case 'place': {
        const data = action.data as PlaceActionData;
        this.delegate.deleteObjectInternal(data.object.id);
        break;
      }
      case 'delete': {
        const data = action.data as DeleteActionData;
        this.delegate.placeObjectInternal(data.object);
        break;
      }
      case 'move': {
        const data = action.data as MoveActionData;
        this.delegate.moveObjectInternal(
          data.objectId,
          data.fromPosition,
          data.fromOrientation,
          data.fromRotation,
          data.fromExactMeshPos
        );
        break;
      }
      case 'rotate': {
        const data = action.data as RotateActionData;
        this.delegate.applyRotationState(data.beforeStates);
        break;
      }
      case 'batch': {
        const batchData = action.data as { actions: HistoryAction[] };
        for (let i = batchData.actions.length - 1; i >= 0; i--) {
          this.applyUndo(batchData.actions[i]);
        }
        break;
      }
      case 'building-create': {
        const data = action.data as BuildingCreateActionData;
        this.delegate.removeBuildingInternal(data.building.id);
        break;
      }
      case 'building-delete': {
        const data = action.data as BuildingDeleteActionData;
        this.delegate.recreateBuildingInternal(data.building);
        break;
      }
      case 'building-move': {
        const data = action.data as BuildingMoveActionData;
        this.delegate.translateBuilding(data.buildingId, -data.deltaX, -data.deltaZ);
        this.delegate.onBuildingMoveSelectionSync(data.buildingId);
        break;
      }
      case 'floor-add': {
        const data = action.data as FloorAddActionData;
        this.delegate.undoFloorAdd(data);
        break;
      }
      case 'floor-delete': {
        const data = action.data as FloorDeleteActionData;
        this.delegate.undoFloorDelete(data);
        break;
      }
      case 'floor-insert': {
        const data = action.data as FloorInsertActionData;
        this.delegate.undoFloorInsert(data);
        break;
      }
      default:
        break;
    }
    this.delegate.emitStateUpdated();
  }

  applyRedo(action: HistoryAction): void {
    switch (action.type) {
      case 'place': {
        const data = action.data as PlaceActionData;
        this.delegate.placeObjectInternal(data.object);
        break;
      }
      case 'delete': {
        const data = action.data as DeleteActionData;
        this.delegate.deleteObjectInternal(data.object.id);
        break;
      }
      case 'move': {
        const data = action.data as MoveActionData;
        this.delegate.moveObjectInternal(
          data.objectId,
          data.toPosition,
          data.toOrientation,
          data.toRotation,
          data.toExactMeshPos
        );
        break;
      }
      case 'rotate': {
        const data = action.data as RotateActionData;
        this.delegate.applyRotationState(data.afterStates);
        break;
      }
      case 'batch': {
        const batchData = action.data as { actions: HistoryAction[] };
        for (const batchAction of batchData.actions) {
          this.applyRedo(batchAction);
        }
        break;
      }
      case 'building-create': {
        const data = action.data as BuildingCreateActionData;
        this.delegate.recreateBuildingInternal(data.building);
        break;
      }
      case 'building-delete': {
        const data = action.data as BuildingDeleteActionData;
        this.delegate.removeBuildingInternal(data.building.id);
        break;
      }
      case 'building-move': {
        const data = action.data as BuildingMoveActionData;
        this.delegate.translateBuilding(data.buildingId, data.deltaX, data.deltaZ);
        this.delegate.onBuildingMoveSelectionSync(data.buildingId);
        break;
      }
      case 'floor-add': {
        const data = action.data as FloorAddActionData;
        this.delegate.redoFloorAdd(data);
        break;
      }
      case 'floor-delete': {
        const data = action.data as FloorDeleteActionData;
        this.delegate.redoFloorDelete(data);
        break;
      }
      case 'floor-insert': {
        const data = action.data as FloorInsertActionData;
        this.delegate.redoFloorInsert(data);
        break;
      }
      default:
        break;
    }
    this.delegate.emitStateUpdated();
  }
}
