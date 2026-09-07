import { AssetRegistry } from '../../../../components/bludesign/assets/AssetRegistry';
import {
  placePlacedObjectFromSavedForImport,
  placePlacedObjectFromSerializedForImport,
} from '../../../../components/bludesign/core/persistence/placeLoadedPlacedObjects';
import { AssetCategory, Orientation, type PlacedObject } from '../../../../components/bludesign/core/types';

const TEST_ASSET_ID = 'place-import-unit';

function makePlacedObject(id = 'obj-1'): PlacedObject {
  return {
    id,
    assetId: TEST_ASSET_ID,
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: {
      id: TEST_ASSET_ID,
      name: 'Small',
      category: AssetCategory.STORAGE_UNIT,
      dimensions: { width: 1, height: 1, depth: 1 },
      gridUnits: { x: 1, z: 1 },
      isSmart: false,
      canRotate: true,
      canStack: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('placeLoadedPlacedObjects', () => {
  beforeEach(() => {
    const registry = AssetRegistry.getInstance();
    registry.unregisterAsset(TEST_ASSET_ID);
    registry.registerAsset(makePlacedObject().assetMetadata);
  });

  it('places reconstructed serialized objects via the coordinator', () => {
    const placeFromSavedData = jest.fn();
    const coordinator = { placeFromSavedData } as never;

    placePlacedObjectFromSerializedForImport(
      {
        id: 'obj-1',
        assetId: TEST_ASSET_ID,
        position: { x: 1, z: 2, y: 0 },
        orientation: Orientation.NORTH,
        floor: 0,
        properties: {},
      },
      coordinator
    );

    expect(placeFromSavedData).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'obj-1', assetId: TEST_ASSET_ID })
    );
  });

  it('warns and skips when asset is missing from registry', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const placeFromSavedData = jest.fn();
    const coordinator = { placeFromSavedData } as never;

    placePlacedObjectFromSerializedForImport(
      {
        id: 'missing',
        assetId: 'not-registered',
        position: { x: 0, z: 0, y: 0 },
        orientation: Orientation.NORTH,
        floor: 0,
        properties: {},
      },
      coordinator
    );

    expect(placeFromSavedData).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('delegates saved objects and logs placement errors', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const placeFromSavedData = jest.fn(() => {
      throw new Error('boom');
    });
    const coordinator = { placeFromSavedData } as never;

    placePlacedObjectFromSavedForImport(makePlacedObject(), coordinator);

    expect(placeFromSavedData).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
