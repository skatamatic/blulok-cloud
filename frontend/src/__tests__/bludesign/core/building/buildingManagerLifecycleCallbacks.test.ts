import { createBuildingManagerLifecycleCallbacks } from '../../../../components/bludesign/core/building/buildingManagerLifecycleCallbacks';
import type { Building } from '../../../../components/bludesign/core/types';
import type { Theme } from '../../../../components/bludesign/core/ThemeManager';

describe('createBuildingManagerLifecycleCallbacks', () => {
  it('pushes building and reapplies theme on create', () => {
    const state = { buildings: [] as Building[], isFloorMode: true, activeFloor: 0 };
    const applyThemeToScene = jest.fn();
    const theme = { id: 't' } as Theme;
    const cbs = createBuildingManagerLifecycleCallbacks({
      state,
      applyThemeToScene,
      getActiveSkinTheme: () => theme,
      floorManager: { clear: jest.fn() },
      selectionManager: { setFloorMode: jest.fn() },
      gridSystem: { setGridY: jest.fn() },
      emitStateUpdated: jest.fn(),
    });

    const b = { id: 'b1' } as Building;
    cbs.onBuildingCreated(b);

    expect(state.buildings).toContain(b);
    expect(applyThemeToScene).toHaveBeenCalledWith(theme);
  });

  it('merges buildings and reapplies theme', () => {
    const b1 = { id: 'b1' } as Building;
    const b2 = { id: 'b2' } as Building;
    const state = { buildings: [b1, b2], isFloorMode: true, activeFloor: 1 };
    const applyThemeToScene = jest.fn();
    const theme = { id: 't' } as Theme;
    const cbs = createBuildingManagerLifecycleCallbacks({
      state,
      applyThemeToScene,
      getActiveSkinTheme: () => theme,
      floorManager: { clear: jest.fn() },
      selectionManager: { setFloorMode: jest.fn() },
      gridSystem: { setGridY: jest.fn() },
      emitStateUpdated: jest.fn(),
    });

    const merged = { id: 'merged' } as Building;
    cbs.onBuildingsMerged(['b1', 'b2'], merged);

    expect(state.buildings).toEqual([merged]);
    expect(applyThemeToScene).toHaveBeenCalledWith(theme);
  });

  it('resets floor mode when the last building is deleted', () => {
    const state = { buildings: [{ id: 'only' } as Building], isFloorMode: true, activeFloor: 2 };
    const floorManager = { clear: jest.fn() };
    const selectionManager = { setFloorMode: jest.fn() };
    const gridSystem = { setGridY: jest.fn() };
    const cbs = createBuildingManagerLifecycleCallbacks({
      state,
      applyThemeToScene: jest.fn(),
      getActiveSkinTheme: () => ({ id: 't' } as Theme),
      floorManager,
      selectionManager,
      gridSystem,
      emitStateUpdated: jest.fn(),
    });

    cbs.onBuildingDeleted('only');

    expect(state.buildings).toHaveLength(0);
    expect(state.isFloorMode).toBe(false);
    expect(state.activeFloor).toBe(0);
    expect(floorManager.clear).toHaveBeenCalled();
    expect(selectionManager.setFloorMode).toHaveBeenCalledWith(false, 0);
    expect(gridSystem.setGridY).toHaveBeenCalledWith(0);
  });

  it('updates an existing building on modify', () => {
    const original = { id: 'b1', name: 'old' } as Building & { name: string };
    const state = { buildings: [original], isFloorMode: false, activeFloor: 0 };
    const cbs = createBuildingManagerLifecycleCallbacks({
      state,
      applyThemeToScene: jest.fn(),
      getActiveSkinTheme: () => ({ id: 't' } as Theme),
      floorManager: { clear: jest.fn() },
      selectionManager: { setFloorMode: jest.fn() },
      gridSystem: { setGridY: jest.fn() },
      emitStateUpdated: jest.fn(),
    });

    const updated = { id: 'b1', name: 'new' } as Building & { name: string };
    cbs.onBuildingModified(updated);

    expect(state.buildings[0]).toEqual(updated);
  });
});
