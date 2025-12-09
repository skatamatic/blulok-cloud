/**
 * History Service
 * 
 * Handles undo/redo operations including:
 * - Action recording
 * - Undo/redo stack management
 * - State restoration
 * 
 * This service is part of the SOLID refactoring of BluDesignEngine.
 */

import { PlacedObject, GridPosition } from '../types';
import { Building } from '../BuildingManager';

export type ActionType = 
  | 'place-object'
  | 'delete-object'
  | 'move-object'
  | 'rotate-object'
  | 'update-skin'
  | 'create-building'
  | 'delete-building'
  | 'merge-buildings'
  | 'add-floor'
  | 'delete-floor'
  | 'batch-place'
  | 'batch-delete';

export interface HistoryAction {
  id: string;
  type: ActionType;
  timestamp: Date;
  data: unknown;
}

export interface PlaceObjectAction extends HistoryAction {
  type: 'place-object';
  data: {
    object: PlacedObject;
  };
}

export interface DeleteObjectAction extends HistoryAction {
  type: 'delete-object';
  data: {
    object: PlacedObject;
  };
}

export interface MoveObjectAction extends HistoryAction {
  type: 'move-object';
  data: {
    objectId: string;
    previousPosition: GridPosition;
    newPosition: GridPosition;
  };
}

export interface RotateObjectAction extends HistoryAction {
  type: 'rotate-object';
  data: {
    objectId: string;
    previousRotation: number;
    newRotation: number;
  };
}

export interface UpdateSkinAction extends HistoryAction {
  type: 'update-skin';
  data: {
    objectId: string;
    previousSkinId?: string;
    newSkinId?: string;
  };
}

export interface BuildingAction extends HistoryAction {
  type: 'create-building' | 'delete-building';
  data: {
    building: Building;
  };
}

export interface FloorAction extends HistoryAction {
  type: 'add-floor' | 'delete-floor';
  data: {
    buildingId: string;
    floorLevel: number;
    objects?: PlacedObject[]; // Objects that were on the floor (for undo of delete)
  };
}

export interface BatchAction extends HistoryAction {
  type: 'batch-place' | 'batch-delete';
  data: {
    objects: PlacedObject[];
  };
}

const MAX_HISTORY_SIZE = 100;

export class HistoryService {
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private onChangeCallbacks: Array<() => void> = [];
  
  /**
   * Record an action for undo/redo
   */
  record(action: Omit<HistoryAction, 'id' | 'timestamp'>): void {
    const fullAction: HistoryAction = {
      ...action,
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    
    this.undoStack.push(fullAction);
    
    // Clear redo stack when new action is recorded
    this.redoStack = [];
    
    // Limit history size
    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }
    
    this.notifyChange();
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
   * Get the last action without removing it
   */
  peekUndo(): HistoryAction | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }
  
  /**
   * Get the next redo action without removing it
   */
  peekRedo(): HistoryAction | undefined {
    return this.redoStack[this.redoStack.length - 1];
  }
  
  /**
   * Pop the last action for undo
   */
  popUndo(): HistoryAction | undefined {
    const action = this.undoStack.pop();
    if (action) {
      this.redoStack.push(action);
      this.notifyChange();
    }
    return action;
  }
  
  /**
   * Pop the next action for redo
   */
  popRedo(): HistoryAction | undefined {
    const action = this.redoStack.pop();
    if (action) {
      this.undoStack.push(action);
      this.notifyChange();
    }
    return action;
  }
  
  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyChange();
  }
  
  /**
   * Get undo stack size
   */
  getUndoCount(): number {
    return this.undoStack.length;
  }
  
  /**
   * Get redo stack size
   */
  getRedoCount(): number {
    return this.redoStack.length;
  }
  
  /**
   * Get description of last undoable action
   */
  getUndoDescription(): string | null {
    const action = this.peekUndo();
    if (!action) return null;
    
    switch (action.type) {
      case 'place-object':
        return 'Undo Place Object';
      case 'delete-object':
        return 'Undo Delete Object';
      case 'move-object':
        return 'Undo Move';
      case 'rotate-object':
        return 'Undo Rotate';
      case 'update-skin':
        return 'Undo Skin Change';
      case 'create-building':
        return 'Undo Create Building';
      case 'delete-building':
        return 'Undo Delete Building';
      case 'add-floor':
        return 'Undo Add Floor';
      case 'delete-floor':
        return 'Undo Delete Floor';
      case 'batch-place':
        return 'Undo Batch Place';
      case 'batch-delete':
        return 'Undo Batch Delete';
      default:
        return 'Undo';
    }
  }
  
  /**
   * Get description of next redoable action
   */
  getRedoDescription(): string | null {
    const action = this.peekRedo();
    if (!action) return null;
    
    switch (action.type) {
      case 'place-object':
        return 'Redo Place Object';
      case 'delete-object':
        return 'Redo Delete Object';
      case 'move-object':
        return 'Redo Move';
      case 'rotate-object':
        return 'Redo Rotate';
      case 'update-skin':
        return 'Redo Skin Change';
      case 'create-building':
        return 'Redo Create Building';
      case 'delete-building':
        return 'Redo Delete Building';
      case 'add-floor':
        return 'Redo Add Floor';
      case 'delete-floor':
        return 'Redo Delete Floor';
      case 'batch-place':
        return 'Redo Batch Place';
      case 'batch-delete':
        return 'Redo Batch Delete';
      default:
        return 'Redo';
    }
  }
  
  /**
   * Register a callback for history changes
   */
  onChange(callback: () => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index >= 0) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }
  
  /**
   * Notify callbacks of changes
   */
  private notifyChange(): void {
    this.onChangeCallbacks.forEach(cb => cb());
  }
  
  /**
   * Export history for serialization
   */
  exportHistory(): { undoStack: HistoryAction[]; redoStack: HistoryAction[] } {
    return {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };
  }
  
  /**
   * Import history from serialized data
   */
  importHistory(data: { undoStack: HistoryAction[]; redoStack: HistoryAction[] }): void {
    this.undoStack = data.undoStack || [];
    this.redoStack = data.redoStack || [];
    this.notifyChange();
  }
}

