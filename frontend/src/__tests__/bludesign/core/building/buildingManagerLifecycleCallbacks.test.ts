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
});
