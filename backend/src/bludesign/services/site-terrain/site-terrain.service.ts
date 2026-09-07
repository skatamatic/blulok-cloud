import type { ElevationTileProvider } from './elevation-provider.interface';
import type { ImageryTileProvider } from './imagery-provider.interface';
import {
  createElevationProvider,
  createImageryProvider,
  createSiteTerrainProviders,
  resolveSiteTerrainConfigFromEnv,
} from './site-terrain.factory';
import { stitchSiteTerrain } from './tile-stitcher';
import {
  autoElevationZoomForDetail,
  autoImageryZoomForDetail,
  boundsFromCenterRadius,
  metersPerPixel,
  MAX_ELEVATION_ZOOM,
  MAX_IMAGERY_ZOOM,
  parseTerrainDetailLevel,
} from './tile-math';
import type {
  FetchSitePackRequest,
  SitePackResult,
  SiteTerrainProviderConfig,
} from './types';

export interface SiteTerrainServiceOptions {
  config?: SiteTerrainProviderConfig;
  elevationProvider?: ElevationTileProvider;
  imageryProvider?: ImageryTileProvider;
  concurrency?: number;
}

export class SiteTerrainService {
  private readonly elevation: ElevationTileProvider;
  private readonly imagery: ImageryTileProvider;
  private readonly config: SiteTerrainProviderConfig;
  private readonly concurrency?: number;

  constructor(options: SiteTerrainServiceOptions = {}) {
    this.config = options.config ?? resolveSiteTerrainConfigFromEnv();
    this.elevation = options.elevationProvider ?? createElevationProvider(this.config.elevation);
    this.imagery = options.imageryProvider ?? createImageryProvider(this.config.imagery);
    this.concurrency = options.concurrency;
  }

  async fetchSitePack(request: FetchSitePackRequest): Promise<SitePackResult> {
    const radiusMeters = request.radiusMeters ?? 400;
    const bounds = boundsFromCenterRadius(request.center, radiusMeters);
    const detailLevel = parseTerrainDetailLevel(request.detailLevel);

    let imageryZoom: number;
    let elevationZoom: number;

    if (request.zoom !== undefined && request.imageryZoom === undefined && request.elevationZoom === undefined) {
      imageryZoom = request.zoom;
      elevationZoom = request.zoom;
    } else {
      imageryZoom =
        request.imageryZoom ??
        autoImageryZoomForDetail(request.center.lat, radiusMeters, detailLevel);
      elevationZoom =
        request.elevationZoom ??
        request.zoom ??
        autoElevationZoomForDetail(detailLevel);
    }

    imageryZoom = Math.min(Math.max(0, imageryZoom), MAX_IMAGERY_ZOOM);
    elevationZoom = Math.min(Math.max(0, elevationZoom), MAX_ELEVATION_ZOOM);

    const stitched = await stitchSiteTerrain({
      bounds,
      imageryZoom,
      elevationZoom,
      elevationProvider: this.elevation,
      imageryProvider: this.imagery,
      concurrency: this.concurrency,
    });

    const imageryMetersPerPixel = metersPerPixel(request.center.lat, imageryZoom);

    return {
      bounds,
      zoom: imageryZoom,
      imageryZoom,
      elevationZoom,
      imageryMetersPerPixel,
      elevation: stitched.elevation,
      imagery: stitched.imagery,
      tilesFetched: stitched.tilesFetched,
      attribution: {
        elevation: this.elevation.getAttribution(),
        imagery: this.imagery.getAttribution(),
      },
      providers: {
        elevation: this.elevation.id,
        imagery: this.imagery.id,
      },
    };
  }

  async healthCheck(): Promise<{ elevation: boolean; imagery: boolean }> {
    const [elevation, imagery] = await Promise.all([
      this.elevation.healthCheck(),
      this.imagery.healthCheck(),
    ]);
    return { elevation, imagery };
  }
}

export function createSiteTerrainService(
  options?: SiteTerrainServiceOptions
): SiteTerrainService {
  return new SiteTerrainService(options ?? {});
}

/** Convenience when both providers should come from env/config together. */
export function createDefaultSiteTerrainService(): SiteTerrainService {
  const providers = createSiteTerrainProviders();
  return new SiteTerrainService({
    elevationProvider: providers.elevation,
    imageryProvider: providers.imagery,
    config: resolveSiteTerrainConfigFromEnv(),
  });
}
