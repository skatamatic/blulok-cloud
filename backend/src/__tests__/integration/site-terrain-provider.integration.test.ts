/**
 * Site terrain provider integration tests — real network fetches.
 *
 * Terrarium elevation always runs (public AWS S3).
 * Esri imagery and full stitch run only when ESRI_API_KEY is set.
 */

import { createElevationProvider, createImageryProvider } from '@/bludesign/services/site-terrain/site-terrain.factory';
import { decodeElevationTile } from '@/bludesign/services/site-terrain/elevation-decoders';
import { SiteTerrainService } from '@/bludesign/services/site-terrain/site-terrain.service';
import sharp from 'sharp';

const TORONTO = { lat: 43.653, lng: -79.383 };
const hasEsriKey = Boolean(process.env.ESRI_API_KEY?.trim());

describe('Site Terrain Provider Integration Tests', () => {
  describe('Terrarium elevation', () => {
    it('fetches a PNG tile and decodes finite heights', async () => {
      const provider = createElevationProvider('terrarium');
      const tile = { z: 15, x: 9644, y: 12315 };
      const result = await provider.fetchTile(tile);

      expect(result.data.length).toBeGreaterThan(100);
      expect(result.data[0]).toBe(0x89);
      expect(result.data[1]).toBe(0x50);

      const { data: rgba, info } = await sharp(result.data)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const heights = decodeElevationTile(provider.encoding, rgba, info.width, info.height);
      expect(heights.length).toBe(info.width * info.height);
      expect(Number.isFinite(heights[0])).toBe(true);
    }, 30_000);
  });

  describe('Esri World Imagery', () => {
    const itEsri = hasEsriKey ? it : it.skip;

    itEsri('fetches a JPEG/PNG imagery tile', async () => {
      const provider = createImageryProvider('esri-world-imagery');
      const result = await provider.fetchTile({ z: 15, x: 9644, y: 12315 });
      expect(result.data.length).toBeGreaterThan(500);
    }, 30_000);
  });

  describe('Full site pack stitch', () => {
    const itEsri = hasEsriKey ? it : it.skip;

    itEsri('stitches elevation + imagery for Toronto site pad', async () => {
      const service = new SiteTerrainService({
        config: { elevation: 'terrarium', imagery: 'esri-world-imagery' },
      });

      const pack = await service.fetchSitePack({
        center: TORONTO,
        radiusMeters: 400,
        zoom: 15,
      });

      expect(pack.imagery.width).toBeGreaterThan(50);
      expect(pack.imagery.height).toBeGreaterThan(50);
      expect(pack.elevation.heights.length).toBe(pack.imagery.width * pack.imagery.height);
      expect(pack.elevation.maxM).toBeGreaterThanOrEqual(pack.elevation.minM);
      expect(Number.isFinite(pack.elevation.minM)).toBe(true);
    }, 120_000);
  });

  describe('Stub providers (offline stitch)', () => {
    it('stitches without network using stub providers', async () => {
      const service = new SiteTerrainService({
        config: { elevation: 'stub', imagery: 'stub' },
      });
      const pack = await service.fetchSitePack({
        center: TORONTO,
        radiusMeters: 200,
        zoom: 14,
      });
      expect(pack.tilesFetched.elevation).toBeGreaterThan(0);
      expect(pack.imagery.rgba.length).toBeGreaterThan(0);
    });
  });
});
