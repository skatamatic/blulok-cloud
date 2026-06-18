/**
 * Site terrain fetch API — keeps provider API keys server-side.
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken } from '../../middleware/auth.middleware';
import { AuthenticatedRequest } from '../../types/auth.types';
import { createDefaultSiteTerrainService } from '../services/site-terrain/site-terrain.service';
import {
  encodeHeightmapPng16,
  encodeImageryJpeg,
} from '../services/site-terrain/heightmap-encoder';
import { SiteTerrainError } from '../services/site-terrain/types';

const router = Router();

const fetchSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  radiusMeters: Joi.number().min(50).max(2000).default(400),
  detailLevel: Joi.string().valid('low', 'med', 'max').default('max'),
  imageryZoom: Joi.number().integer().min(10).max(19).optional(),
  elevationZoom: Joi.number().integer().min(0).max(15).optional(),
});

/**
 * POST /api/v1/bludesign/site-terrain/fetch
 * Fetch and stitch satellite imagery + elevation for a site pad.
 */
router.post('/fetch', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { error, value } = fetchSchema.validate(req.body);
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
});

export { router as siteTerrainRouter };
