/**
 * Active floor / full-building view coordination (mocked port).
 */

import { FloorViewCoordinator } from '../../../../components/bludesign/core/floors/FloorViewCoordinator';

describe('FloorViewCoordinator', () => {
  it('setActiveFloor updates state, syncs placement, ghosting uses !isFloorMode', () => {
    const state = { activeFloor: 0, isFloorMode: true };
    const api = {
      getActiveFloor: jest.fn(() => state.activeFloor),
      setActiveFloorLevel: jest.fn((level: number) => {
        state.activeFloor = level;
      }),
      getIsFloorMode: jest.fn(() => state.isFloorMode),
      setIsFloorMode: jest.fn(),
      floorManagerSetFloor: jest.fn(),
      floorManagerSetFullBuildingView: jest.fn(),
      selectionSetFloorMode: jest.fn(),
      onActiveFloorIndexChanged: jest.fn(),
      syncPlacementToFloor: jest.fn(),
      applySceneFloorGhosting: jest.fn(),
      emitStateUpdated: jest.fn(),
    };

    const coord = new FloorViewCoordinator(api);
    coord.setActiveFloor(2);

    expect(api.setActiveFloorLevel).toHaveBeenCalledWith(2);
    expect(api.floorManagerSetFloor).toHaveBeenCalledWith(2);
    expect(api.selectionSetFloorMode).toHaveBeenCalledWith(true, 2);
    expect(api.onActiveFloorIndexChanged).toHaveBeenCalledWith(0, 2);
    expect(api.syncPlacementToFloor).toHaveBeenCalledWith(2);
    expect(api.applySceneFloorGhosting).toHaveBeenCalledWith(2, false);
    expect(api.emitStateUpdated).toHaveBeenCalledTimes(1);
  });

  it('setActiveFloor does not clear grid alignment when floor unchanged', () => {
    const state = { activeFloor: 1, isFloorMode: true };
    const api = {
      getActiveFloor: jest.fn(() => state.activeFloor),
      setActiveFloorLevel: jest.fn((level: number) => {
        state.activeFloor = level;
      }),
      getIsFloorMode: jest.fn(() => state.isFloorMode),
      setIsFloorMode: jest.fn(),
      floorManagerSetFloor: jest.fn(),
      floorManagerSetFullBuildingView: jest.fn(),
      selectionSetFloorMode: jest.fn(),
      onActiveFloorIndexChanged: jest.fn(),
      syncPlacementToFloor: jest.fn(),
      applySceneFloorGhosting: jest.fn(),
      emitStateUpdated: jest.fn(),
    };

    const coord = new FloorViewCoordinator(api);
    coord.setActiveFloor(1);

    expect(api.onActiveFloorIndexChanged).not.toHaveBeenCalled();
  });

  it('toggleFullBuildingView flips mode, resets floor to 0 when leaving floor mode', () => {
    const state = { activeFloor: 2, isFloorMode: true };
    const api = {
      getActiveFloor: jest.fn(() => state.activeFloor),
      setActiveFloorLevel: jest.fn((level: number) => {
        state.activeFloor = level;
      }),
      getIsFloorMode: jest.fn(() => state.isFloorMode),
      setIsFloorMode: jest.fn((v: boolean) => {
        state.isFloorMode = v;
      }),
      floorManagerSetFloor: jest.fn(),
      floorManagerSetFullBuildingView: jest.fn(),
      selectionSetFloorMode: jest.fn(),
      onActiveFloorIndexChanged: jest.fn(),
      syncPlacementToFloor: jest.fn(),
      applySceneFloorGhosting: jest.fn(),
      emitStateUpdated: jest.fn(),
    };

    const coord = new FloorViewCoordinator(api);
    coord.toggleFullBuildingView();

    expect(api.setIsFloorMode).toHaveBeenCalledWith(false);
    expect(api.setActiveFloorLevel).toHaveBeenCalledWith(0);
    expect(api.floorManagerSetFullBuildingView).toHaveBeenCalledWith(true);
    expect(api.applySceneFloorGhosting).toHaveBeenCalledWith(0, true);
  });

  it('toggleFullBuildingView keeps active floor when entering per-floor mode', () => {
    const state = { activeFloor: 3, isFloorMode: false };
    const api = {
      getActiveFloor: jest.fn(() => state.activeFloor),
      setActiveFloorLevel: jest.fn((level: number) => {
        state.activeFloor = level;
      }),
      getIsFloorMode: jest.fn(() => state.isFloorMode),
      setIsFloorMode: jest.fn((v: boolean) => {
        state.isFloorMode = v;
      }),
      floorManagerSetFloor: jest.fn(),
      floorManagerSetFullBuildingView: jest.fn(),
      selectionSetFloorMode: jest.fn(),
      onActiveFloorIndexChanged: jest.fn(),
      syncPlacementToFloor: jest.fn(),
      applySceneFloorGhosting: jest.fn(),
      emitStateUpdated: jest.fn(),
    };

    const coord = new FloorViewCoordinator(api);
    coord.toggleFullBuildingView();

    expect(api.setActiveFloorLevel).not.toHaveBeenCalled();
    expect(api.selectionSetFloorMode).toHaveBeenCalledWith(true, 3);
    expect(api.floorManagerSetFullBuildingView).toHaveBeenCalledWith(false);
    expect(api.applySceneFloorGhosting).toHaveBeenCalledWith(3, false);
  });

  it('setActiveFloor uses full-building ghosting when not in floor mode', () => {
    const state = { activeFloor: 0, isFloorMode: false };
    const api = {
      getActiveFloor: jest.fn(() => state.activeFloor),
      setActiveFloorLevel: jest.fn((level: number) => {
        state.activeFloor = level;
      }),
      getIsFloorMode: jest.fn(() => state.isFloorMode),
      setIsFloorMode: jest.fn(),
      floorManagerSetFloor: jest.fn(),
      floorManagerSetFullBuildingView: jest.fn(),
      selectionSetFloorMode: jest.fn(),
      onActiveFloorIndexChanged: jest.fn(),
      syncPlacementToFloor: jest.fn(),
      applySceneFloorGhosting: jest.fn(),
      emitStateUpdated: jest.fn(),
    };

    const coord = new FloorViewCoordinator(api);
    coord.setActiveFloor(2);

    expect(api.applySceneFloorGhosting).toHaveBeenCalledWith(2, true);
  });

  it('toggleFullBuildingView does not call floorManagerSetFloor', () => {
    const state = { activeFloor: 1, isFloorMode: true };
    const api = {
      getActiveFloor: jest.fn(() => state.activeFloor),
      setActiveFloorLevel: jest.fn((level: number) => {
        state.activeFloor = level;
      }),
      getIsFloorMode: jest.fn(() => state.isFloorMode),
      setIsFloorMode: jest.fn((v: boolean) => {
        state.isFloorMode = v;
      }),
      floorManagerSetFloor: jest.fn(),
      floorManagerSetFullBuildingView: jest.fn(),
      selectionSetFloorMode: jest.fn(),
      onActiveFloorIndexChanged: jest.fn(),
      syncPlacementToFloor: jest.fn(),
      applySceneFloorGhosting: jest.fn(),
      emitStateUpdated: jest.fn(),
    };

    const coord = new FloorViewCoordinator(api);
    coord.toggleFullBuildingView();

    expect(api.floorManagerSetFloor).not.toHaveBeenCalled();
  });
});
