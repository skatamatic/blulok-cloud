/**
 * Floor copy / vertical-shaft propagation (port-based; no Three.js scene).
 */

import { FloorObjectReplication } from '../../../../components/bludesign/core/floors/FloorObjectReplication';
import {
  Orientation,
  PlacedObject,
  AssetCategory,
} from '../../../../components/bludesign/core/types';

const baseMeta = {
  id: 'asset-x',
  name: 'X',
  category: AssetCategory.STORAGE_UNIT,
  gridUnits: { x: 1, z: 1 },
  dimensions: { width: 1, height: 1, depth: 1 },
  isSmart: false,
  canRotate: true,
  canStack: false,
};

function makeObj(
  id: string,
  floor: number,
  opts: { verticalShaftId?: string; name?: string } = {}
): PlacedObject {
  return {
    id,
    assetId: 'asset-x',
    assetMetadata: baseMeta as PlacedObject['assetMetadata'],
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor,
    properties: {},
    verticalShaftId: opts.verticalShaftId,
    name: opts.name,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('FloorObjectReplication', () => {
  it('copyNonShaftContents clones non-shaft objects and batches history', () => {
    const a = makeObj('a', 0);
    const b = makeObj('b', 0, { verticalShaftId: 'shaft-1' });

    const place = jest.fn();
    const emit = jest.fn();
    const batch = jest.fn();

    const rep = new FloorObjectReplication({
      listObjectIds: () => ['a', 'b'],
      getObjectData: (id) => (id === 'a' ? a : id === 'b' ? b : undefined),
      placeFromReplication: place,
      emitObjectPlaced: emit,
      historyPushBatch: batch,
      historyPushPlace: jest.fn(),
    });

    rep.copyNonShaftContents(0, 1);

    expect(place).toHaveBeenCalledTimes(1);
    expect(place.mock.calls[0][0].floor).toBe(1);
    expect(place.mock.calls[0][0].id).not.toBe('a');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(1);
  });

  it('addVerticalShaftsToNewFloor adds one instance per shaft id', () => {
    const s1 = makeObj('s1', 0, { verticalShaftId: 'shaft-a' });
    const s2 = makeObj('s2', 1, { verticalShaftId: 'shaft-a' });

    const place = jest.fn();
    const emit = jest.fn();
    const single = jest.fn();

    const rep = new FloorObjectReplication({
      listObjectIds: () => ['s1', 's2'],
      getObjectData: (id) => (id === 's1' ? s1 : id === 's2' ? s2 : undefined),
      placeFromReplication: place,
      emitObjectPlaced: emit,
      historyPushBatch: jest.fn(),
      historyPushPlace: single,
    });

    rep.addVerticalShaftsToNewFloor(2);

    expect(place).toHaveBeenCalledTimes(1);
    expect(place.mock.calls[0][0].floor).toBe(2);
    expect(place.mock.calls[0][0].verticalShaftId).toBe('shaft-a');
    expect(single).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('addVerticalShaftsToNewFloor skips when shaft already exists on target floor', () => {
    const on0 = makeObj('a', 0, { verticalShaftId: 'shaft-a' });
    const on2 = makeObj('b', 2, { verticalShaftId: 'shaft-a' });

    const place = jest.fn();

    const rep = new FloorObjectReplication({
      listObjectIds: () => ['a', 'b'],
      getObjectData: (id) => (id === 'a' ? on0 : id === 'b' ? on2 : undefined),
      placeFromReplication: place,
      emitObjectPlaced: jest.fn(),
      historyPushBatch: jest.fn(),
      historyPushPlace: jest.fn(),
    });

    rep.addVerticalShaftsToNewFloor(2);

    expect(place).not.toHaveBeenCalled();
  });

  it('copyNonShaftContents does not call history when nothing matches source floor', () => {
    const batch = jest.fn();
    const place = jest.fn();
    const rep = new FloorObjectReplication({
      listObjectIds: () => ['a'],
      getObjectData: () => makeObj('a', 2),
      placeFromReplication: place,
      emitObjectPlaced: jest.fn(),
      historyPushBatch: batch,
      historyPushPlace: jest.fn(),
    });

    rep.copyNonShaftContents(0, 1);

    expect(place).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('copyNonShaftContents skips objects without assetMetadata', () => {
    const broken = { ...makeObj('a', 0), assetMetadata: undefined } as unknown as PlacedObject;

    const place = jest.fn();
    const batch = jest.fn();

    const rep = new FloorObjectReplication({
      listObjectIds: () => ['a'],
      getObjectData: () => broken,
      placeFromReplication: place,
      emitObjectPlaced: jest.fn(),
      historyPushBatch: batch,
      historyPushPlace: jest.fn(),
    });

    rep.copyNonShaftContents(0, 1);

    expect(place).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('copyNonShaftContents rewrites display name when name uses (F#) suffix', () => {
    const src = makeObj('a', 0, { name: 'Unit (F0)' });
    const place = jest.fn();

    const rep = new FloorObjectReplication({
      listObjectIds: () => ['a'],
      getObjectData: () => src,
      placeFromReplication: place,
      emitObjectPlaced: jest.fn(),
      historyPushBatch: jest.fn(),
      historyPushPlace: jest.fn(),
    });

    rep.copyNonShaftContents(0, 3);

    expect(place.mock.calls[0][0].name).toBe('Unit (F3)');
  });

  it('addVerticalShaftsToNewFloor skips objects with disableVerticalShaft', () => {
    const shaft = makeObj('s', 0, { verticalShaftId: 'shaft-x' });
    (shaft as PlacedObject & { disableVerticalShaft?: boolean }).disableVerticalShaft = true;

    const place = jest.fn();
    const rep = new FloorObjectReplication({
      listObjectIds: () => ['s'],
      getObjectData: () => shaft,
      placeFromReplication: place,
      emitObjectPlaced: jest.fn(),
      historyPushBatch: jest.fn(),
      historyPushPlace: jest.fn(),
    });

    rep.addVerticalShaftsToNewFloor(1);

    expect(place).not.toHaveBeenCalled();
  });

  it('addVerticalShaftsToNewFloor places one object per distinct shaft id', () => {
    const a = makeObj('a', 0, { verticalShaftId: 'shaft-1' });
    const b = makeObj('b', 0, { verticalShaftId: 'shaft-2' });

    const place = jest.fn();
    const rep = new FloorObjectReplication({
      listObjectIds: () => ['a', 'b'],
      getObjectData: (id) => (id === 'a' ? a : b),
      placeFromReplication: place,
      emitObjectPlaced: jest.fn(),
      historyPushBatch: jest.fn(),
      historyPushPlace: jest.fn(),
    });

    rep.addVerticalShaftsToNewFloor(4);

    expect(place).toHaveBeenCalledTimes(2);
    const shaftIds = place.mock.calls.map((c) => c[0].verticalShaftId).sort();
    expect(shaftIds).toEqual(['shaft-1', 'shaft-2']);
  });
});
