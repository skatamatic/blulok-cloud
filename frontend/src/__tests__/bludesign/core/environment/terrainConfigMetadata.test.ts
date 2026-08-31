import {
  attachTerrainConfigToFacilityData,
  buildTerrainConfigFromFetch,
  getTerrainConfigFromFacility,
  hasTerrainConfig,
  normalizeTerrainConfig,
  stripTerrainConfigFromFacilityData,
} from '@/components/bludesign/core/environment/terrainConfigMetadata';
import type { FacilityData } from '@/components/bludesign/core/types';

const sampleMeta = {
  width: 512,
  height: 512,
  minM: 100,
  maxM: 200,
  imageryZoom: 18,
  elevationZoom: 15,
  imageryMetersPerPixel: 0.4,
  bounds: { north: 49.5, south: 49.4, east: -119.5, west: -119.6 },
  providers: { elevation: 'terrarium', imagery: 'esri-world-imagery' },
  attribution: { elevation: 'Mapzen', imagery: 'Esri' },
  worldSizeMeters: 800,
};

describe('terrainConfigMetadata', () => {
  it('normalizes valid terrain config', () => {
    const config = buildTerrainConfigFromFetch('terrain-1', { lat: 49.45, lng: -119.6 }, 400, sampleMeta);
    expect(normalizeTerrainConfig(config)?.version).toBe(1);
    expect(normalizeTerrainConfig(config)?.terrainDataId).toBe('terrain-1');
    expect(normalizeTerrainConfig(config)?.detailLevel).toBe('max');
    expect(config.meshWidth).toBe(512);
  });

  it('defaults detail level to max for legacy configs', () => {
    const config = buildTerrainConfigFromFetch('terrain-1', { lat: 49.45, lng: -119.6 }, 400, sampleMeta);
    const { detailLevel: _, ...legacy } = config;
    expect(normalizeTerrainConfig(legacy)?.detailLevel).toBe('max');
  });

  it('rejects invalid terrain config', () => {
    expect(normalizeTerrainConfig(null)).toBeNull();
    expect(normalizeTerrainConfig({ version: 2 })).toBeNull();
  });

  it('attaches and strips terrain config on facility data', () => {
    const base = {
      name: 'x',
      version: '2',
      camera: {},
      placedObjects: [],
      gridSize: 10,
      showGrid: false,
    } as FacilityData;
    const config = buildTerrainConfigFromFetch('terrain-2', { lat: 1, lng: 2 }, 400, sampleMeta);
    const withTerrain = attachTerrainConfigToFacilityData(base, config);
    expect(hasTerrainConfig(withTerrain)).toBe(true);
    expect(getTerrainConfigFromFacility(withTerrain)?.center.lat).toBe(1);
    const stripped = stripTerrainConfigFromFacilityData(withTerrain);
    expect(getTerrainConfigFromFacility(stripped)).toBeNull();
  });
});
