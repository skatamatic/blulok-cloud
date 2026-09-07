import { Menu } from 'electron';
import type { HistoryState } from '@protocol/ipc-channels';

export function updateEditMenuHistory(state: HistoryState): void {
  if (typeof Menu?.getApplicationMenu !== 'function') return;
  const menu = Menu.getApplicationMenu();
  const undo = menu?.getMenuItemById('edit-undo');
  const redo = menu?.getMenuItemById('edit-redo');
  if (undo) {
    undo.enabled = state.canUndo;
    undo.label = state.undoLabel ? `Undo ${state.undoLabel}` : 'Undo';
  }
  if (redo) {
    redo.enabled = state.canRedo;
    redo.label = state.redoLabel ? `Redo ${state.redoLabel}` : 'Redo';
  }
}
