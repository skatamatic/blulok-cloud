/**
 * Floor delete / insert orchestration (mocked port).
 */

import {
  FloorStructureOperations,
  type FloorStructureOperationsApi,
} from '../../../../components/bludesign/core/floors/FloorStructureOperations';
import type { Floor, PlacedObject } from '../../../../components/bludesign/core/types';

const sampleFloor = { id: 'f1', level: 1, name: 'L1' } as unknown as Floor;

function makeApi(overrides: Partial<FloorStructureOperationsApi> = {}): FloorStructureOperationsApi {
  const o1 = { id: 'o1', floor: 1 } as PlacedObject;
  return {
    getFirstBuildingId: jest.fn(() => 'b1'),
    getFloor: jest.fn(() => sampleFloor),
    listPlacedObjectsOnFloor: jest.fn(() => [o1]),
    deleteObjectInternal: jest.fn(),
    removeFloorFromBuilding: jest.fn(() => sampleFloor),
    shiftBuildingFloorLevels: jest.fn(),
    shiftObjectFloors: jest.fn(() => [{ id: 'x', oldFloor: 2, newFloor: 1 }]),
    getObjectData: jest.fn((id: string) => (id === 'x' ? { id: 'x', floor: 2 } as PlacedObject : null)),
    unregisterFloor: jest.fn(),
    shiftFloors: jest.fn(),
    pushFloorDelete: jest.fn(),
    pushFloorInsert: jest.fn(),
    pushFloorAdd: jest.fn(),
    addFloorToBuilding: jest.fn(() => sampleFloor),
    registerFloor: jest.fn(),
    seedNewFloorContents: jest.fn(),
    applyActiveSkinThemeToScene: jest.fn(),
    navigateToFloor: jest.fn(),
    syncBuildingsFromManager: jest.fn(),
    emitStateUpdated: jest.fn(),
    scheduleAutoSave: jest.fn(),
    ...overrides,
  } satisfies FloorStructureOperationsApi;
}

describe('FloorStructureOperations', () => {
  it('deleteFloor removes objects, shifts floors, records history', () => {
    const api = makeApi();
    const ops = new FloorStructureOperations(api);
    ops.deleteFloor(1);

    expect(api.deleteObjectInternal).toHaveBeenCalledWith('o1');
    expect(api.removeFloorFromBuilding).toHaveBeenCalledWith('b1', 1);
    expect(api.shiftBuildingFloorLevels).toHaveBeenCalledWith('b1', 2, -1);
    expect(api.shiftObjectFloors).toHaveBeenCalledWith(2, -1);
    expect(api.unregisterFloor).toHaveBeenCalledWith(1);
    expect(api.shiftFloors).toHaveBeenCalledWith(2, -1);
    expect(api.pushFloorDelete).toHaveBeenCalled();
    expect(api.syncBuildingsFromManager).toHaveBeenCalled();
    expect(api.emitStateUpdated).toHaveBeenCalled();
    expect(api.scheduleAutoSave).toHaveBeenCalled();
  });

  it('deleteFloor is a no-op when no building', () => {
    const api = makeApi({ getFirstBuildingId: jest.fn(() => null) });
    const ops = new FloorStructureOperations(api);
    ops.deleteFloor(1);
    expect(api.deleteObjectInternal).not.toHaveBeenCalled();
  });

  it('insertFloor shifts, adds floor, theme, navigates', () => {
    const api = makeApi({
      listPlacedObjectsOnFloor: jest.fn(() => []),
      getFloor: jest.fn(() => undefined),
    });
    const ops = new FloorStructureOperations(api);
    ops.insertFloor(1);

    expect(api.shiftBuildingFloorLevels).toHaveBeenCalledWith('b1', 1, 1);
    expect(api.addFloorToBuilding).toHaveBeenCalledWith('b1', 1);
    expect(api.registerFloor).toHaveBeenCalledWith(1);
    expect(api.seedNewFloorContents).toHaveBeenCalledWith(1);
    expect(api.pushFloorInsert).toHaveBeenCalled();
    expect(api.applyActiveSkinThemeToScene).toHaveBeenCalled();
    expect(api.navigateToFloor).toHaveBeenCalledWith(1);
    expect(api.syncBuildingsFromManager).toHaveBeenCalled();
    expect(api.emitStateUpdated).toHaveBeenCalled();
    expect(api.scheduleAutoSave).toHaveBeenCalled();
  });

  it('deleteFloor is a no-op when floor does not exist on building', () => {
    const api = makeApi({
      getFloor: jest.fn(() => undefined),
    });
    const ops = new FloorStructureOperations(api);
    ops.deleteFloor(9);
    expect(api.deleteObjectInternal).not.toHaveBeenCalled();
    expect(api.removeFloorFromBuilding).not.toHaveBeenCalled();
  });

  it('deleteFloor stops after removeFloorFromBuilding returns null', () => {
    const api = makeApi({
      removeFloorFromBuilding: jest.fn(() => null),
    });
    const ops = new FloorStructureOperations(api);
    ops.deleteFloor(1);
    expect(api.shiftBuildingFloorLevels).not.toHaveBeenCalled();
    expect(api.pushFloorDelete).not.toHaveBeenCalled();
  });

  it('insertFloor is a no-op when no building', () => {
    const api = makeApi({ getFirstBuildingId: jest.fn(() => null) });
    const ops = new FloorStructureOperations(api);
    ops.insertFloor(1);
    expect(api.shiftBuildingFloorLevels).not.toHaveBeenCalled();
    expect(api.navigateToFloor).not.toHaveBeenCalled();
  });

  it('deleteFloor passes removed floor and objects to history', () => {
    const o1 = { id: 'o1', floor: 1 } as PlacedObject;
    const api = makeApi({
      listPlacedObjectsOnFloor: jest.fn(() => [o1]),
    });
    const ops = new FloorStructureOperations(api);
    ops.deleteFloor(1);
    expect(api.pushFloorDelete).toHaveBeenCalledWith('b1', sampleFloor, [o1]);
  });

  it('deleteFloor updates mesh data floor for shifted objects', () => {
    const shifted = { id: 'x', floor: 99 } as PlacedObject;
    const api = makeApi({
      shiftObjectFloors: jest.fn(() => [{ id: 'x', oldFloor: 2, newFloor: 1 }]),
      getObjectData: jest.fn(() => shifted),
    });
    const ops = new FloorStructureOperations(api);
    ops.deleteFloor(1);
    expect(shifted.floor).toBe(1);
  });

  it('insertFloor passes new floor and shifted objects to history', () => {
    const shifted = [{ id: 'a', oldFloor: 1, newFloor: 2 }];
    const api = makeApi({
      shiftObjectFloors: jest.fn(() => shifted),
    });
    const ops = new FloorStructureOperations(api);
    ops.insertFloor(1);
    expect(api.pushFloorInsert).toHaveBeenCalledWith('b1', sampleFloor, 1, shifted);
  });

  it('addFloor registers floor, seeds contents, theme, navigates, autosaves', () => {
    const api = makeApi();
    const ops = new FloorStructureOperations(api);
    ops.addFloor(2);

    expect(api.addFloorToBuilding).toHaveBeenCalledWith('b1', 2);
    expect(api.pushFloorAdd).toHaveBeenCalledWith('b1', sampleFloor);
    expect(api.seedNewFloorContents).toHaveBeenCalledWith(2, undefined);
    expect(api.navigateToFloor).toHaveBeenCalledWith(2);
    expect(api.scheduleAutoSave).toHaveBeenCalled();
  });

  it('addFloor passes copyFromFloor into seedNewFloorContents', () => {
    const api = makeApi();
    const ops = new FloorStructureOperations(api);
    ops.addFloor(3, 0);

    expect(api.seedNewFloorContents).toHaveBeenCalledWith(3, 0);
  });

  it('addFloor is a no-op when no building', () => {
    const api = makeApi({ getFirstBuildingId: jest.fn(() => null) });
    const ops = new FloorStructureOperations(api);
    ops.addFloor(1);
    expect(api.addFloorToBuilding).not.toHaveBeenCalled();
  });
});
