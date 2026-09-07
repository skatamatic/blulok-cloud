/**
 * Site terrain fetch API — keeps provider API keys server-side.
 */

import { Router, Response } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { AuthenticatedRequest } from '../../types/auth.types';
import { createDefaultSiteTerrainService } from '../services/site-terrain/site-terrain.service';
import {
  encodeHeightmapPng16,
  encodeImageryJpeg,
} from '../services/site-terrain/heightmap-encoder';
import { SiteTerrainError } from '../services/site-terrain/types';
import { registerPost } from '@/openapi/register-route';
import { siteTerrainFetchSchema } from '@/schemas/bludesign/site-terrain.schemas';

const router = Router();
const MOUNT = '/api/v1/bludesign/site-terrain';

/**
 * POST /api/v1/bludesign/site-terrain/fetch
 * Fetch and stitch satellite imagery + elevation for a site pad.
 */
registerPost(
  router,
  '/fetch',
  {
    openApiPath: `${MOUNT}/fetch`,
    tags: ['BluDesign'],
    summary: 'Fetch site terrain imagery and elevation',
    security: 'bearer',
  },
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { error, value } = siteTerrainFetchSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const service = createDefaultSiteTerrainService();
      const pack = await service.fetchSitePack({
        center: { lat: value.lat, lng: value.lng },
        radiusMeters: value.radiusMeters,
        detailLevel: value.detailLevel,
        imageryZoom: value.imageryZoom,
        elevationZoom: value.elevationZoom,
      });

      const [imageryJpeg, heightmapPng] = await Promise.all([
        encodeImageryJpeg(
          pack.imagery.rgba,
          pack.imagery.width,
          pack.imagery.height
        ),
        encodeHeightmapPng16(
          pack.elevation.heights,
          pack.elevation.width,
          pack.elevation.height,
          pack.elevation.minM,
          pack.elevation.maxM
        ),
      ]);

      res.json({
        imageryBase64: imageryJpeg.toString('base64'),
        heightmapBase64: heightmapPng.toString('base64'),
        meta: {
          width: pack.imagery.width,
          height: pack.imagery.height,
          minM: pack.elevation.minM,
          maxM: pack.elevation.maxM,
          imageryZoom: pack.imageryZoom,
          elevationZoom: pack.elevationZoom,
          detailLevel: value.detailLevel,
          imageryMetersPerPixel: pack.imageryMetersPerPixel,
          bounds: pack.bounds,
          providers: pack.providers,
          attribution: pack.attribution,
          worldSizeMeters: value.radiusMeters * 2,
        },
      });
    } catch (err) {
      if (err instanceof SiteTerrainError) {
        const status = err.code === 'CONFIGURATION_ERROR' ? 503 : 502;
        return res.status(status).json({ error: err.message, code: err.code });
      }
      console.error('Site terrain fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch site terrain' });
    }
  },
);

export { router as siteTerrainRouter };
