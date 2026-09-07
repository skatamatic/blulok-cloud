import type { EditorState, SelectionState } from '../types';

/**
 * Merges {@link SelectionManager} updates into {@link EditorState.selection}
 * (preserves `selectedBuildingId` when only hover changes; clears it on real selection changes).
 */
export function applyEngineSelectionChangeFromManager(
  incoming: SelectionState,
  ctx: {
    state: EditorState;
    updateSelectionHighlights: (previousSelectedIds: string[], nextSelectedIds: string[]) => void;
    emitSelectionChanged: (selection: EditorState['selection']) => void;
    updateGizmoVisibility: () => void;
  }
): void {
  const previousIds = ctx.state.selection.selectedIds;
  ctx.updateSelectionHighlights(previousIds, incoming.selectedIds);

  const oldIds = new Set(previousIds);
  const newIds = new Set(incoming.selectedIds);
  const selectionChanged =
    oldIds.size !== newIds.size || [...oldIds].some((id) => !newIds.has(id));

  if (selectionChanged) {
    ctx.state.selection.selectedBuildingId = undefined;
  }

  const preservedBuildingId = ctx.state.selection.selectedBuildingId;
  ctx.state.selection = { ...incoming, selectedBuildingId: preservedBuildingId };
  ctx.emitSelectionChanged(ctx.state.selection);

  if (selectionChanged) {
    ctx.updateGizmoVisibility();
  }
}
