import { ActionHistory } from '../../../components/bludesign/core/ActionHistory';
import { BluDesignEventBus } from '../../../components/bludesign/core/engine/BluDesignEventBus';
import { AssetCategory, Orientation } from '../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../components/bludesign/core/types';

function minimalPlacedObject(id: string): PlacedObject {
  const assetMetadata: PlacedObject['assetMetadata'] = {
    id: 'asset-1',
    name: 'Unit',
    category: AssetCategory.STORAGE_UNIT,
    gridUnits: { x: 1, z: 1 },
    dimensions: { width: 1, height: 1, depth: 1 },
    isSmart: false,
    canRotate: true,
    canStack: false,
  };
  return {
    id,
    assetId: 'asset-1',
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

describe('ActionHistory', () => {
  it('tracks undo/redo availability after push and undo', () => {
    const history = new ActionHistory();
    expect(history.canUndo()).toBe(false);

    history.pushPlace(minimalPlacedObject('obj-1'));
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    const undone = history.undo();
    expect(undone?.type).toBe('place');
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('exposes canUndo/canRedo on event.data when bridged through BluDesignEventBus', () => {
    const history = new ActionHistory();
    const bus = new BluDesignEventBus();

    history.on((event) => bus.emit('history-changed', event));

    const listener = jest.fn();
    bus.on('history-changed', listener);

    history.pushPlace(minimalPlacedObject('obj-1'));

    expect(listener).toHaveBeenCalledTimes(1);
    const engineEvent = listener.mock.calls[0][0];
    expect(engineEvent.data.canUndo).toBe(true);
    expect(engineEvent.data.canRedo).toBe(false);
    expect(engineEvent.canUndo).toBeUndefined();
    expect(engineEvent.canRedo).toBeUndefined();
  });
});
