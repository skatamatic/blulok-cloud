import { Orientation, type PlacedObject } from '../../../../components/bludesign/core/types';
import { syncPlacedObjectOrientationFromWorldYaw } from '../../../../components/bludesign/core/placement/orientationFromWorldYaw';

function po(): PlacedObject {
  return {
    id: 'a',
    assetId: 'a',
    assetMetadata: {} as PlacedObject['assetMetadata'],
    position: { x: 0, z: 0, y: 0 },
    orientation: Orientation.NORTH,
    canStack: false,
    floor: 0,
    properties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('syncPlacedObjectOrientationFromWorldYaw', () => {
  it('maps yaw quadrants to cardinals', () => {
    const p = po();
    syncPlacedObjectOrientationFromWorldYaw(p, 0);
    expect(p.orientation).toBe(Orientation.NORTH);
    syncPlacedObjectOrientationFromWorldYaw(p, Math.PI / 2);
    expect(p.orientation).toBe(Orientation.EAST);
    syncPlacedObjectOrientationFromWorldYaw(p, Math.PI);
    expect(p.orientation).toBe(Orientation.SOUTH);
    syncPlacedObjectOrientationFromWorldYaw(p, (3 * Math.PI) / 2);
    expect(p.orientation).toBe(Orientation.WEST);
  });

  it('normalizes large angles', () => {
    const p = po();
    syncPlacedObjectOrientationFromWorldYaw(p, Math.PI / 2 + 4 * Math.PI);
    expect(p.orientation).toBe(Orientation.EAST);
  });
});
