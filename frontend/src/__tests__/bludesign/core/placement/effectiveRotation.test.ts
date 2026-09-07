import { Orientation } from '../../../../components/bludesign/core/types';
import type { PlacedObject } from '../../../../components/bludesign/core/types';
import {
  getEffectiveRotation,
  getRotationFromOrientation,
} from '../../../../components/bludesign/core/placement/effectiveRotation';

function placed(overrides: Partial<PlacedObject>): PlacedObject {
  return {
    id: 'o1',
    assetId: 'a1',
    name: 'O',
    position: { x: 0, z: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    assetMetadata: {} as PlacedObject['assetMetadata'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('effectiveRotation', () => {
  describe('getRotationFromOrientation', () => {
    it('maps the four cardinal directions to Y rotations', () => {
      expect(getRotationFromOrientation(Orientation.NORTH)).toBe(0);
      expect(getRotationFromOrientation(Orientation.EAST)).toBeCloseTo(Math.PI / 2);
      expect(getRotationFromOrientation(Orientation.SOUTH)).toBeCloseTo(Math.PI);
      expect(getRotationFromOrientation(Orientation.WEST)).toBeCloseTo(-Math.PI / 2);
    });
  });

  describe('getEffectiveRotation', () => {
    it('prefers explicit rotation when defined (including zero)', () => {
      expect(getEffectiveRotation(placed({ rotation: 1.25 }))).toBe(1.25);
      expect(getEffectiveRotation(placed({ rotation: 0, orientation: Orientation.EAST }))).toBe(0);
    });

    it('falls back to orientation when rotation is undefined', () => {
      expect(getEffectiveRotation(placed({ orientation: Orientation.SOUTH }))).toBeCloseTo(Math.PI);
    });
  });
});
