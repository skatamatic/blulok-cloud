import type { HistoryState } from '@protocol/ipc-channels';
import type { HistoryEntry, SimulatorSnapshot } from './simulator-history.types';
import { cloneSnapshot } from './simulator-snapshot.utils';

const MAX_ENTRIES = 50;

export class SimulatorHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  push(entry: HistoryEntry): void {
    this.undoStack.push({
      label: entry.label,
      before: cloneSnapshot(entry.before),
      after: cloneSnapshot(entry.after),
      coalesceKey: entry.coalesceKey,
    });
    if (this.undoStack.length > MAX_ENTRIES) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  coalesceLatestAfter(after: HistoryEntry['after']): boolean {
    const last = this.undoStack[this.undoStack.length - 1];
    if (!last) return false;
    last.after = cloneSnapshot(after);
    this.redoStack = [];
    return true;
  }

  peekUndo(): HistoryEntry | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  peekRedo(): HistoryEntry | undefined {
    return this.redoStack[this.redoStack.length - 1];
  }

  popUndo(): HistoryEntry | undefined {
    return this.undoStack.pop();
  }

  popRedo(): HistoryEntry | undefined {
    return this.redoStack.pop();
  }

  pushRedo(entry: HistoryEntry): void {
    this.redoStack.push({
      label: entry.label,
      before: cloneSnapshot(entry.before),
      after: cloneSnapshot(entry.after),
      coalesceKey: entry.coalesceKey,
    });
  }

  pushUndo(entry: HistoryEntry): void {
    this.undoStack.push({
      label: entry.label,
      before: cloneSnapshot(entry.before),
      after: cloneSnapshot(entry.after),
      coalesceKey: entry.coalesceKey,
    });
  }

  getState(): HistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.peekUndo()?.label,
      redoLabel: this.peekRedo()?.label,
    };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
