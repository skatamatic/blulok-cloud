import {
  autoElevationZoomForDetail,
  autoImageryZoomForDetail,
  autoImageryZoomForRadius,
  boundsFromCenterRadius,
  cropRectForBounds,
  latToTileY,
  lngToTileX,
  metersPerPixel,
  tileGridExtents,
  tilesForBounds,
} from '@/bludesign/services/site-terrain/tile-math';

describe('tile-math', () => {
  const toronto = { lat: 43.653, lng: -79.383 };

  it('converts lng/lat to tile indices at z=15', () => {
    const x = lngToTileX(toronto.lng, 15);
    const y = latToTileY(toronto.lat, 15);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
  });

  it('builds bounds from center and radius', () => {
    const bounds = boundsFromCenterRadius(toronto, 400);
    expect(bounds.north).toBeGreaterThan(toronto.lat);
    expect(bounds.south).toBeLessThan(toronto.lat);
    expect(bounds.east).toBeGreaterThan(toronto.lng);
    expect(bounds.west).toBeLessThan(toronto.lng);
  });

  it('returns unique tiles for bounds', () => {
    const bounds = boundsFromCenterRadius(toronto, 400);
    const tiles = tilesForBounds(bounds, 15);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.z === 15)).toBe(true);
    const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
    expect(keys.size).toBe(tiles.length);
  });

  it('computes meters per pixel decreasing with zoom', () => {
    const z14 = metersPerPixel(toronto.lat, 14);
    const z15 = metersPerPixel(toronto.lat, 15);
    expect(z15).toBeLessThan(z14);
    expect(z15).toBeGreaterThan(0);
  });

  it('auto-selects reasonable imagery zoom for site radius at max detail', () => {
    const z = autoImageryZoomForRadius(toronto.lat, 400);
    expect(z).toBeGreaterThanOrEqual(16);
    expect(z).toBeLessThanOrEqual(18);
  });

  it('selects lower zoom for low detail than max detail', () => {
    const low = autoImageryZoomForDetail(toronto.lat, 400, 'low');
    const med = autoImageryZoomForDetail(toronto.lat, 400, 'med');
    const max = autoImageryZoomForDetail(toronto.lat, 400, 'max');
    expect(low).toBeLessThan(med);
    expect(med).toBeLessThan(max);
    expect(autoElevationZoomForDetail('low')).toBeLessThan(autoElevationZoomForDetail('max'));
  });

  it('produces a valid crop rect within canvas', () => {
    const bounds = boundsFromCenterRadius(toronto, 400);
    const zoom = 15;
    const extents = tileGridExtents(bounds, zoom);
    const crop = cropRectForBounds(bounds, zoom, extents);
    expect(crop.left).toBeGreaterThanOrEqual(0);
    expect(crop.top).toBeGreaterThanOrEqual(0);
    expect(crop.left + crop.width).toBeLessThanOrEqual(extents.canvasWidth);
    expect(crop.top + crop.height).toBeLessThanOrEqual(extents.canvasHeight);
    expect(crop.width).toBeGreaterThan(0);
    expect(crop.height).toBeGreaterThan(0);
  });
});
