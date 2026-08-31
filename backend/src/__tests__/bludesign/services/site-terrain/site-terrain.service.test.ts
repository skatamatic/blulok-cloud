import { SiteTerrainService } from '@/bludesign/services/site-terrain/site-terrain.service';
import { StubElevationProvider } from '@/bludesign/services/site-terrain/providers/stub.elevation.provider';
import { StubImageryProvider } from '@/bludesign/services/site-terrain/providers/stub.imagery.provider';

describe('SiteTerrainService', () => {
  const service = new SiteTerrainService({
    config: { elevation: 'stub', imagery: 'stub' },
    elevationProvider: new StubElevationProvider(),
    imageryProvider: new StubImageryProvider(),
  });

  it('fetchSitePack returns stitched site pack with stub providers', async () => {
    const pack = await service.fetchSitePack({
      center: { lat: 43.653, lng: -79.383 },
      radiusMeters: 400,
      zoom: 15,
    });

    expect(pack.zoom).toBe(15);
    expect(pack.providers.elevation).toBe('stub');
    expect(pack.providers.imagery).toBe('stub');
    expect(pack.elevation.heights.length).toBeGreaterThan(0);
    expect(pack.imagery.rgba.length).toBeGreaterThan(0);
    expect(pack.attribution.elevation).toContain('Stub');
    expect(pack.tilesFetched.elevation).toBeGreaterThan(0);
  });

  it('healthCheck returns true for stub providers', async () => {
    const health = await service.healthCheck();
    expect(health.elevation).toBe(true);
    expect(health.imagery).toBe(true);
  });
});
