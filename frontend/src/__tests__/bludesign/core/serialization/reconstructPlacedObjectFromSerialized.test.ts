import { reconstructPlacedObjectFromSerialized } from '../../../../components/bludesign/core/serialization/reconstructPlacedObjectFromSerialized';
import {
  Orientation,
  SerializedPlacedObject,
  AssetCategory,
  DeviceState,
  type AssetMetadata,
} from '../../../../components/bludesign/core/types';

const meta: AssetMetadata = {
  id: 'a1',
  name: 'U',
  category: AssetCategory.STORAGE_UNIT,
  gridUnits: { x: 1, z: 1 },
  dimensions: { width: 1, height: 1, depth: 1 },
  isSmart: false,
  canRotate: true,
  canStack: true,
};

describe('reconstructPlacedObjectFromSerialized', () => {
  it('returns null when asset is not in registry callback', () => {
    const s: SerializedPlacedObject = {
      id: 'o1',
      assetId: 'missing',
      position: { x: 0, z: 0 },
      orientation: Orientation.NORTH,
      properties: {},
    };
    expect(reconstructPlacedObjectFromSerialized(s, () => undefined)).toBeNull();
  });

  it('reconstructs binding and optional fields', () => {
    const s: SerializedPlacedObject = {
      id: 'o1',
      assetId: 'a1',
      position: { x: 1, z: 2 },
      orientation: Orientation.EAST,
      rotation: 0.5,
      exactMeshPos: { x: 1.2, z: 3.4 },
      floor: 2,
      buildingId: 'b1',
      name: 'Unit',
      skinId: 'skin-x',
      wallAttachment: { wallId: 'w1', position: 0.4 },
      binding: { entityType: 'unit', entityId: 'e1' },
      properties: { k: 1 },
    };

    const o = reconstructPlacedObjectFromSerialized(s, () => meta);
    expect(o).not.toBeNull();
    expect(o!.assetId).toBe('a1');
    expect(o!.floor).toBe(2);
    expect(o!.binding).toEqual({
      entityType: 'unit',
      entityId: 'e1',
      currentState: DeviceState.UNKNOWN,
    });
    expect(o!.properties).toEqual({ k: 1 });
  });
});
