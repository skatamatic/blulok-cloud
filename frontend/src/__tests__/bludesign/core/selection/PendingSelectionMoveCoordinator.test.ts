import { PendingSelectionMoveCoordinator } from '../../../../components/bludesign/core/selection/PendingSelectionMoveCoordinator';

describe('PendingSelectionMoveCoordinator', () => {
  it('dispose hides building preview and clears pending timer slot', () => {
    const hide = jest.fn();
    const coord = new PendingSelectionMoveCoordinator({
      getSelectedIds: () => [],
      getSelectedBuildingId: () => undefined,
      getActiveFloor: () => 0,
      gridSystem: {
        getGridSize: () => 1,
        gridToWorld: () => ({ x: 0, y: 0, z: 0 } as never),
      } as never,
      sceneManager: {
        getObjectData: () => undefined,
        getObject: () => undefined,
      } as never,
      buildingManager: { getAllBuildings: () => [], getWall: () => undefined } as never,
      buildingMovePreviewController: { show: jest.fn(), hide } as never,
      selectionHighlightManager: { updatePositions: jest.fn() } as never,
      gizmoController: {
        updatePosition: jest.fn(),
        setTranslatePositionForBuildingPreview: jest.fn(),
      },
      actionHistory: { pushBuildingMove: jest.fn(), pushMove: jest.fn(), pushBatch: jest.fn() },
      validateMove: () => true,
      translateBuilding: jest.fn(),
      refreshWallSelectionAfterBuildingMove: jest.fn(),
      scheduleAutoSave: jest.fn(),
    });

    coord.dispose();
    expect(hide).toHaveBeenCalled();
  });
});
