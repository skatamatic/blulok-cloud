/**
 * History undo/redo dispatch — pure coordinator with mocked engine delegate.
 */

import {
  HistoryActionApplier,
  type HistoryActionApplierDelegate,
} from '../../../../components/bludesign/core/history/HistoryActionApplier';
import type { HistoryAction } from '../../../../components/bludesign/core/ActionHistory';
import { AssetCategory, Orientation } from '../../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../../components/bludesign/core/types';

function po(id: string): PlacedObject {
  const assetMetadata: PlacedObject['assetMetadata'] = {
    id: 'a',
    name: 'A',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 1, z: 1 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
  };
  return {
    id,
    assetId: 'a',
    name: id,
    position: { x: 0, z: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function delegate(): HistoryActionApplierDelegate & { emits: number } {
  const d: HistoryActionApplierDelegate & { emits: number } = {
    emits: 0,
    emitStateUpdated() {
      d.emits += 1;
    },
    deleteObjectInternal: jest.fn(),
    placeObjectInternal: jest.fn(),
    moveObjectInternal: jest.fn(),
    applyRotationState: jest.fn(),
    removeBuildingInternal: jest.fn(),
    recreateBuildingInternal: jest.fn(),
    translateBuilding: jest.fn(),
    onBuildingMoveSelectionSync: jest.fn(),
    undoFloorAdd: jest.fn(),
    redoFloorAdd: jest.fn(),
    undoFloorDelete: jest.fn(),
    redoFloorDelete: jest.fn(),
    undoFloorInsert: jest.fn(),
    redoFloorInsert: jest.fn(),
  };
  return d;
}

describe('HistoryActionApplier', () => {
  it('applyUndo(place) deletes the placed object', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const object = po('x1');
    const action: HistoryAction = {
      type: 'place',
      data: { object },
      timestamp: 1,
    };

    applier.applyUndo(action);

    expect(d.deleteObjectInternal).toHaveBeenCalledWith('x1');
    expect(d.emits).toBe(1);
  });

  it('applyRedo(place) places the object', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const object = po('x1');
    const action: HistoryAction = {
      type: 'place',
      data: { object },
      timestamp: 1,
    };

    applier.applyRedo(action);

    expect(d.placeObjectInternal).toHaveBeenCalledWith(object);
    expect(d.emits).toBe(1);
  });

  it('applyUndo(batch) runs child undos in reverse order and emits per child', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const a1: HistoryAction = { type: 'place', data: { object: po('1') }, timestamp: 1 };
    const a2: HistoryAction = { type: 'place', data: { object: po('2') }, timestamp: 2 };
    const a3: HistoryAction = { type: 'place', data: { object: po('3') }, timestamp: 3 };
    const batch: HistoryAction = {
      type: 'batch',
      data: { actions: [a1, a2, a3] },
      timestamp: 4,
    };

    applier.applyUndo(batch);

    expect((d.deleteObjectInternal as jest.Mock).mock.calls.map((c: string[]) => c[0])).toEqual([
      '3',
      '2',
      '1',
    ]);
    expect(d.emits).toBe(4);
  });

  it('applyRedo(batch) runs child redos in forward order', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const a1: HistoryAction = { type: 'delete', data: { object: po('1') }, timestamp: 1 };
    const a2: HistoryAction = { type: 'delete', data: { object: po('2') }, timestamp: 2 };
    const batch: HistoryAction = {
      type: 'batch',
      data: { actions: [a1, a2] },
      timestamp: 3,
    };

    applier.applyRedo(batch);

    expect((d.deleteObjectInternal as jest.Mock).mock.calls.map((c: string[]) => c[0])).toEqual(['1', '2']);
    expect(d.emits).toBe(3);
  });

  it('applyUndo(building-move) translates by negative delta and syncs selection', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const action: HistoryAction = {
      type: 'building-move',
      data: { buildingId: 'b1', deltaX: 2, deltaZ: -3 },
      timestamp: 1,
    };

    applier.applyUndo(action);

    expect(d.translateBuilding).toHaveBeenCalledWith('b1', -2, 3);
    expect(d.onBuildingMoveSelectionSync).toHaveBeenCalledWith('b1');
  });

  it('applyRedo(floor-add) delegates to redoFloorAdd', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const floor = { level: 2, height: 4, groundTileIds: [] as string[] };
    const action: HistoryAction = {
      type: 'floor-add',
      data: { buildingId: 'bid', floor },
      timestamp: 1,
    };

    applier.applyRedo(action);

    expect(d.redoFloorAdd).toHaveBeenCalledWith({ buildingId: 'bid', floor });
    expect(d.emits).toBe(1);
  });

  it('applyUndo(move) uses from* fields', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const action: HistoryAction = {
      type: 'move',
      data: {
        objectId: 'o1',
        fromPosition: { x: 1, z: 2 },
        toPosition: { x: 3, z: 4 },
        fromOrientation: Orientation.NORTH,
        toOrientation: Orientation.EAST,
        fromRotation: 0.5,
        toRotation: 1.5,
        fromExactMeshPos: { x: 1, z: 2 },
        toExactMeshPos: { x: 9, z: 9 },
      },
      timestamp: 1,
    };

    applier.applyUndo(action);

    expect(d.moveObjectInternal).toHaveBeenCalledWith(
      'o1',
      { x: 1, z: 2 },
      Orientation.NORTH,
      0.5,
      { x: 1, z: 2 }
    );
  });

  it('applyRedo(move) uses to* fields', () => {
    const d = delegate();
    const applier = new HistoryActionApplier(d);
    const action: HistoryAction = {
      type: 'move',
      data: {
        objectId: 'o1',
        fromPosition: { x: 1, z: 2 },
        toPosition: { x: 3, z: 4 },
        fromOrientation: Orientation.NORTH,
        toOrientation: Orientation.EAST,
        toRotation: 2,
        toExactMeshPos: { x: 8, z: 8 },
      },
      timestamp: 1,
    };

    applier.applyRedo(action);

    expect(d.moveObjectInternal).toHaveBeenCalledWith(
      'o1',
      { x: 3, z: 4 },
      Orientation.EAST,
      2,
      { x: 8, z: 8 }
    );
  });
});
