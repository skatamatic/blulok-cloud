import { stitchSiteTerrain } from '@/bludesign/services/site-terrain/tile-stitcher';
import { boundsFromCenterRadius } from '@/bludesign/services/site-terrain/tile-math';
import { StubElevationProvider } from '@/bludesign/services/site-terrain/providers/stub.elevation.provider';
import { StubImageryProvider } from '@/bludesign/services/site-terrain/providers/stub.imagery.provider';

describe('tile-stitcher', () => {
  const center = { lat: 43.653, lng: -79.383 };

  it('stitches stub tiles into cropped elevation and imagery', async () => {
    const bounds = boundsFromCenterRadius(center, 400);
    const result = await stitchSiteTerrain({
      bounds,
      imageryZoom: 15,
      elevationZoom: 15,
      elevationProvider: new StubElevationProvider(),
      imageryProvider: new StubImageryProvider(),
      concurrency: 4,
    });

    expect(result.elevation.width).toBeGreaterThan(0);
    expect(result.elevation.height).toBeGreaterThan(0);
    expect(result.elevation.heights.length).toBe(
      result.elevation.width * result.elevation.height
    );
    expect(result.imagery.rgba.length).toBe(
      result.imagery.width * result.imagery.height * 4
    );
    expect(result.tilesFetched.elevation).toBeGreaterThan(0);
    expect(result.tilesFetched.imagery).toBe(result.tilesFetched.elevation);
    expect(Number.isFinite(result.elevation.minM)).toBe(true);
    expect(Number.isFinite(result.elevation.maxM)).toBe(true);
    expect(result.elevation.maxM).toBeGreaterThanOrEqual(result.elevation.minM);
  });
});
