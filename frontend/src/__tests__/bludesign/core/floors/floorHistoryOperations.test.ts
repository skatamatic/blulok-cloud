import { FloorHistoryOperations } from '../../../../components/bludesign/core/floors/floorHistoryOperations';
import type { FloorDeleteActionData, FloorInsertActionData } from '../../../../components/bludesign/core/ActionHistory';
import type { Theme } from '../../../../components/bludesign/core/ThemeManager';
import type { PlacedObject } from '../../../../components/bludesign/core/types';

function makeOps() {
  const buildingManager = {
    shiftFloorLevels: jest.fn(),
    addFloor: jest.fn(),
    removeFloor: jest.fn(),
  };
  const floorManager = {
    shiftFloors: jest.fn(),
    shiftObjectFloors: jest.fn(),
    registerFloor: jest.fn(),
    unregisterFloor: jest.fn(),
  };
  const placed: PlacedObject[] = [{ id: 'o1', floor: 2 } as PlacedObject];
  const sceneManager = {
    getAllPlacedObjects: jest.fn(() => placed),
    getObject: jest.fn(),
    getObjectData: jest.fn(),
  };
  const syncBuildingsState = jest.fn();
  const applyThemeToScene = jest.fn();
  const getActiveSkinTheme = jest.fn((): Theme => ({}) as Theme);
  const floorObjectReplication = { addVerticalShaftsToNewFloor: jest.fn() };
  const setFloorLevel = jest.fn();
  const placeObjectInternal = jest.fn();
  const deleteObjectInternal = jest.fn();

  const ops = new FloorHistoryOperations({
    buildingManager,
    floorManager,
    sceneManager,
    gridSystem: { getGridSize: () => 1 },
    placeObjectInternal,
    deleteObjectInternal,
    syncBuildingsState,
    applyThemeToScene,
    getActiveSkinTheme,
    floorObjectReplication,
    setFloorLevel,
  });

  return {
    ops,
    buildingManager,
    floorManager,
    sceneManager,
    placed,
    syncBuildingsState,
    applyThemeToScene,
    floorObjectReplication,
    setFloorLevel,
    placeObjectInternal,
    deleteObjectInternal,
  };
}

describe('FloorHistoryOperations', () => {
  it('undoFloorDelete shifts levels, restores floor and objects, syncs and themes', () => {
    const ctx = makeOps();
    const data: FloorDeleteActionData = {
      buildingId: 'b1',
      floor: { level: 2 } as FloorDeleteActionData['floor'],
      deletedObjects: [{ id: 'gone' } as PlacedObject],
    };
    ctx.ops.undoFloorDelete(data);

    expect(ctx.buildingManager.shiftFloorLevels).toHaveBeenCalledWith('b1', 2, 1);
    expect(ctx.floorManager.shiftFloors).toHaveBeenCalledWith(2, 1);
    expect(ctx.floorManager.shiftObjectFloors).toHaveBeenCalledWith(2, 1);
    expect(ctx.placed[0].floor).toBe(3);
    expect(ctx.buildingManager.addFloor).toHaveBeenCalledWith('b1', 2);
    expect(ctx.placeObjectInternal).toHaveBeenCalledWith(data.deletedObjects[0]);
    expect(ctx.syncBuildingsState).toHaveBeenCalled();
    expect(ctx.applyThemeToScene).toHaveBeenCalled();
  });

  it('redoFloorInsert shifts meshes and floors, registers shafts, sets active floor', () => {
    const ctx = makeOps();
    const mesh = {
      userData: {} as { floor?: number },
      position: { y: 0 },
    };
    ctx.sceneManager.getObject.mockReturnValue(mesh);
    ctx.sceneManager.getObjectData.mockReturnValue({ id: 'x', floor: 0 } as PlacedObject);

    const data: FloorInsertActionData = {
      buildingId: 'b1',
      floor: {} as FloorInsertActionData['floor'],
      insertLevel: 1,
      shiftedObjects: [{ id: 'x', oldFloor: 0, newFloor: 2 }],
    };
    ctx.ops.redoFloorInsert(data);

    expect(ctx.buildingManager.shiftFloorLevels).toHaveBeenCalledWith('b1', 1, 1);
    expect(ctx.floorObjectReplication.addVerticalShaftsToNewFloor).toHaveBeenCalledWith(1);
    expect(ctx.setFloorLevel).toHaveBeenCalledWith(1);
  });
});
