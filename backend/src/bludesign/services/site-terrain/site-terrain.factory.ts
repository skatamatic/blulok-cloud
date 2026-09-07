import type { ElevationTileProvider } from './elevation-provider.interface';
import type { ImageryTileProvider } from './imagery-provider.interface';
import {
  SiteTerrainError,
  SiteTerrainErrorCode,
  type ElevationProviderId,
  type ImageryProviderId,
  type SiteTerrainProviderConfig,
} from './types';
import { EsriWorldImageryProvider } from './providers/esri-world-imagery.provider';
import { MapboxSatelliteProvider } from './providers/mapbox-satellite.provider';
import { MapboxTerrainRgbProvider } from './providers/mapbox-terrain-rgb.provider';
import { StubElevationProvider } from './providers/stub.elevation.provider';
import { StubImageryProvider } from './providers/stub.imagery.provider';
import { TerrariumElevationProvider } from './providers/terrarium.provider';

function readEnvElevationProvider(): ElevationProviderId {
  const raw = process.env.SITE_TERRAIN_ELEVATION_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === 'terrarium') return 'terrarium';
  if (raw === 'mapbox-terrain-rgb') return 'mapbox-terrain-rgb';
  if (raw === 'stub') return 'stub';
  throw new SiteTerrainError(
    `Unknown SITE_TERRAIN_ELEVATION_PROVIDER: ${raw}`,
    SiteTerrainErrorCode.CONFIGURATION_ERROR
  );
}

function readEnvImageryProvider(): ImageryProviderId {
  const raw = process.env.SITE_TERRAIN_IMAGERY_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === 'esri-world-imagery') return 'esri-world-imagery';
  if (raw === 'mapbox-satellite') return 'mapbox-satellite';
  if (raw === 'stub') return 'stub';
  throw new SiteTerrainError(
    `Unknown SITE_TERRAIN_IMAGERY_PROVIDER: ${raw}`,
    SiteTerrainErrorCode.CONFIGURATION_ERROR
  );
}

export function resolveSiteTerrainConfigFromEnv(): SiteTerrainProviderConfig {
  return {
    elevation: readEnvElevationProvider(),
    imagery: readEnvImageryProvider(),
  };
}

export function createElevationProvider(
  id: ElevationProviderId = readEnvElevationProvider()
): ElevationTileProvider {
  switch (id) {
    case 'terrarium':
      return new TerrariumElevationProvider();
    case 'mapbox-terrain-rgb': {
      const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
      if (!token) {
        throw new SiteTerrainError(
          'MAPBOX_ACCESS_TOKEN is required for mapbox-terrain-rgb elevation provider',
          SiteTerrainErrorCode.CONFIGURATION_ERROR
        );
      }
      return new MapboxTerrainRgbProvider({ accessToken: token });
    }
    case 'stub':
      return new StubElevationProvider();
    default:
      throw new SiteTerrainError(
        `Unknown elevation provider: ${id}`,
        SiteTerrainErrorCode.CONFIGURATION_ERROR
      );
  }
}

export function createImageryProvider(
  id: ImageryProviderId = readEnvImageryProvider()
): ImageryTileProvider {
  switch (id) {
    case 'esri-world-imagery': {
      const apiKey = process.env.ESRI_API_KEY?.trim();
      if (!apiKey) {
        throw new SiteTerrainError(
          'ESRI_API_KEY is required for esri-world-imagery provider',
          SiteTerrainErrorCode.CONFIGURATION_ERROR
        );
      }
      return new EsriWorldImageryProvider({ apiKey });
    }
    case 'mapbox-satellite': {
      const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
      if (!token) {
        throw new SiteTerrainError(
          'MAPBOX_ACCESS_TOKEN is required for mapbox-satellite imagery provider',
          SiteTerrainErrorCode.CONFIGURATION_ERROR
        );
      }
      return new MapboxSatelliteProvider({ accessToken: token });
    }
    case 'stub':
      return new StubImageryProvider();
    default:
      throw new SiteTerrainError(
        `Unknown imagery provider: ${id}`,
        SiteTerrainErrorCode.CONFIGURATION_ERROR
      );
  }
}

export function createSiteTerrainProviders(
  config: SiteTerrainProviderConfig = resolveSiteTerrainConfigFromEnv()
): { elevation: ElevationTileProvider; imagery: ImageryTileProvider } {
  return {
    elevation: createElevationProvider(config.elevation),
    imagery: createImageryProvider(config.imagery),
  };
}
