/**
 * Action History Manager
 * 
 * Provides undo/redo functionality for the editor.
 * Tracks placement, deletion, move, and property change actions.
 */

import { PlacedObject, GridPosition, Orientation, Building, Floor } from './types';

// Action types
export type ActionType = 
  | 'place' 
  | 'delete' 
  | 'move' 
  | 'property-change' 
  | 'batch'
  | 'building-create'
  | 'building-delete'
  | 'building-move'
  | 'floor-add'
  | 'floor-delete'
  | 'floor-insert';

// Individual action data types
export interface PlaceActionData {
  object: PlacedObject;
}

export interface DeleteActionData {
  object: PlacedObject;
}

export interface MoveActionData {
  objectId: string;
  fromPosition: GridPosition;
  toPosition: GridPosition;
  fromOrientation: Orientation;
  toOrientation: Orientation;
}

export interface PropertyChangeData {
  objectId: string;
  property: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface BatchActionData {
  actions: HistoryAction[];
}

// Building action data
export interface BuildingCreateActionData {
  building: Building;
}

export interface BuildingDeleteActionData {
  building: Building;
}

export interface BuildingMoveActionData {
  buildingId: string;
  deltaX: number;
  deltaZ: number;
}

// Floor action data
export interface FloorAddActionData {
  buildingId: string;
  floor: Floor;
}

export interface FloorDeleteActionData {
  buildingId: string;
  floor: Floor;
  deletedObjects: PlacedObject[]; // Objects that were on this floor
}

export interface FloorInsertActionData {
  buildingId: string;
  floor: Floor;
  insertLevel: number;
  shiftedObjects: { id: string; oldFloor: number; newFloor: number }[];
}

export type ActionData = 
  | PlaceActionData 
  | DeleteActionData 
  | MoveActionData 
  | PropertyChangeData 
  | BatchActionData
  | BuildingCreateActionData
  | BuildingDeleteActionData
  | BuildingMoveActionData
  | FloorAddActionData
  | FloorDeleteActionData
  | FloorInsertActionData;

// History action
export interface HistoryAction {
  type: ActionType;
  data: ActionData;
  timestamp: number;
}

// Event types
export type HistoryEventType = 'push' | 'undo' | 'redo' | 'clear';

export interface HistoryEvent {
  type: HistoryEventType;
  action?: HistoryAction;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}

export type HistoryEventHandler = (event: HistoryEvent) => void;

/**
 * Action History Manager
 * 
 * Manages undo/redo stacks for editor actions.
 */
export class ActionHistory {
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private maxHistory: number;
  private eventHandlers: Set<HistoryEventHandler> = new Set();

  constructor(maxHistory: number = 100) {
    this.maxHistory = maxHistory;
  }

  /**
   * Subscribe to history events
   */
  on(handler: HistoryEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all handlers
   */
  private emit(type: HistoryEventType, action?: HistoryAction): void {
    const event: HistoryEvent = {
      type,
      action,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    };
    this.eventHandlers.forEach(handler => handler(event));
  }

  /**
   * Push a new action onto the undo stack
   */
  push(action: HistoryAction): void {
    // Clear redo stack when a new action is pushed
    this.redoStack = [];
    
    // Add to undo stack
    this.undoStack.push(action);
    
    // Trim if exceeds max
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    
    this.emit('push', action);
  }

  /**
   * Push a place action
   */
  pushPlace(object: PlacedObject): void {
    this.push({
      type: 'place',
      data: { object } as PlaceActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a delete action
   */
  pushDelete(object: PlacedObject): void {
    this.push({
      type: 'delete',
      data: { object } as DeleteActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a move action
   */
  pushMove(
    objectId: string,
    fromPosition: GridPosition,
    toPosition: GridPosition,
    fromOrientation: Orientation,
    toOrientation: Orientation
  ): void {
    this.push({
      type: 'move',
      data: {
        objectId,
        fromPosition,
        toPosition,
        fromOrientation,
        toOrientation,
      } as MoveActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a property change action
   */
  pushPropertyChange(
    objectId: string,
    property: string,
    oldValue: unknown,
    newValue: unknown
  ): void {
    this.push({
      type: 'property-change',
      data: {
        objectId,
        property,
        oldValue,
        newValue,
      } as PropertyChangeData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a batch action (multiple actions at once)
   */
  pushBatch(actions: HistoryAction[]): void {
    if (actions.length === 0) return;
    
    this.push({
      type: 'batch',
      data: { actions } as BatchActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a batch of place actions (e.g., ground tiles)
   * All placements are recorded as a single undo action
   */
  pushBatchPlace(objects: PlacedObject[]): void {
    if (objects.length === 0) return;
    
    // Create individual place actions
    const actions: HistoryAction[] = objects.map(object => ({
      type: 'place' as ActionType,
      data: { object } as PlaceActionData,
      timestamp: Date.now(),
    }));
    
    // Push as a single batch action
    this.pushBatch(actions);
  }

  /**
   * Push a building create action
   */
  pushBuildingCreate(building: Building): void {
    this.push({
      type: 'building-create',
      data: { building } as BuildingCreateActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a building delete action
   */
  pushBuildingDelete(building: Building): void {
    this.push({
      type: 'building-delete',
      data: { building } as BuildingDeleteActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a building move action
   */
  pushBuildingMove(buildingId: string, deltaX: number, deltaZ: number): void {
    this.push({
      type: 'building-move',
      data: { buildingId, deltaX, deltaZ } as BuildingMoveActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a floor add action
   */
  pushFloorAdd(buildingId: string, floor: Floor): void {
    this.push({
      type: 'floor-add',
      data: { buildingId, floor } as FloorAddActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a floor delete action
   */
  pushFloorDelete(buildingId: string, floor: Floor, deletedObjects: PlacedObject[]): void {
    this.push({
      type: 'floor-delete',
      data: { buildingId, floor, deletedObjects } as FloorDeleteActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Push a floor insert action
   */
  pushFloorInsert(
    buildingId: string, 
    floor: Floor, 
    insertLevel: number,
    shiftedObjects: { id: string; oldFloor: number; newFloor: number }[]
  ): void {
    this.push({
      type: 'floor-insert',
      data: { buildingId, floor, insertLevel, shiftedObjects } as FloorInsertActionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Pop the last action from undo stack and push to redo
   */
  undo(): HistoryAction | null {
    const action = this.undoStack.pop();
    if (action) {
      this.redoStack.push(action);
      this.emit('undo', action);
    }
    return action || null;
  }

  /**
   * Pop the last action from redo stack and push to undo
   */
  redo(): HistoryAction | null {
    const action = this.redoStack.pop();
    if (action) {
      this.undoStack.push(action);
      this.emit('redo', action);
    }
    return action || null;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get the count of undo actions
   */
  getUndoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Get the count of redo actions
   */
  getRedoCount(): number {
    return this.redoStack.length;
  }

  /**
   * Peek at the next undo action without removing it
   */
  peekUndo(): HistoryAction | null {
    return this.undoStack[this.undoStack.length - 1] || null;
  }

  /**
   * Peek at the next redo action without removing it
   */
  peekRedo(): HistoryAction | null {
    return this.redoStack[this.redoStack.length - 1] || null;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit('clear');
  }

  /**
   * Get a description of an action for UI display
   */
  static getActionDescription(action: HistoryAction): string {
    switch (action.type) {
      case 'place':
        return 'Place asset';
      case 'delete':
        return 'Delete asset';
      case 'move':
        return 'Move asset';
      case 'property-change': {
        const data = action.data as PropertyChangeData;
        return `Change ${data.property}`;
      }
      case 'batch': {
        const data = action.data as BatchActionData;
        return `${data.actions.length} actions`;
      }
      case 'building-create':
        return 'Create building';
      case 'building-delete':
        return 'Delete building';
      case 'floor-add': {
        const data = action.data as FloorAddActionData;
        return `Add floor ${data.floor.level}`;
      }
      case 'floor-delete': {
        const data = action.data as FloorDeleteActionData;
        return `Delete floor ${data.floor.level}`;
      }
      case 'floor-insert': {
        const data = action.data as FloorInsertActionData;
        return `Insert floor at ${data.insertLevel}`;
      }
      default:
        return 'Unknown action';
    }
  }
}



