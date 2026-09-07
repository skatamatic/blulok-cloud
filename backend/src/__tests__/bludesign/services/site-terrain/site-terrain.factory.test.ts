import {
  createElevationProvider,
  createImageryProvider,
  resolveSiteTerrainConfigFromEnv,
} from '@/bludesign/services/site-terrain/site-terrain.factory';
import { SiteTerrainError } from '@/bludesign/services/site-terrain/types';
import { StubElevationProvider } from '@/bludesign/services/site-terrain/providers/stub.elevation.provider';
import { StubImageryProvider } from '@/bludesign/services/site-terrain/providers/stub.imagery.provider';

describe('site-terrain.factory', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  it('creates stub providers', () => {
    const elev = createElevationProvider('stub');
    const img = createImageryProvider('stub');
    expect(elev).toBeInstanceOf(StubElevationProvider);
    expect(img).toBeInstanceOf(StubImageryProvider);
  });

  it('creates terrarium without API key', () => {
    const elev = createElevationProvider('terrarium');
    expect(elev.id).toBe('terrarium');
    expect(elev.encoding).toBe('terrarium');
  });

  it('throws when Esri imagery selected without ESRI_API_KEY', () => {
    delete process.env.ESRI_API_KEY;
    expect(() => createImageryProvider('esri-world-imagery')).toThrow(SiteTerrainError);
  });

  it('throws when Mapbox elevation selected without token', () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    expect(() => createElevationProvider('mapbox-terrain-rgb')).toThrow(SiteTerrainError);
  });

  it('resolves config from env defaults', () => {
    delete process.env.SITE_TERRAIN_ELEVATION_PROVIDER;
    delete process.env.SITE_TERRAIN_IMAGERY_PROVIDER;
    const config = resolveSiteTerrainConfigFromEnv();
    expect(config.elevation).toBe('terrarium');
    expect(config.imagery).toBe('esri-world-imagery');
  });
});
