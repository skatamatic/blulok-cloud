import request from 'supertest';
import express from 'express';
import { siteTerrainRouter } from '@/bludesign/routes/site-terrain.routes';

jest.mock('@/middleware/auth.middleware', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user?: { userId: string } }).user = { userId: 'user-1' };
    next();
  },
}));

const fetchSitePack = jest.fn();

jest.mock('@/bludesign/services/site-terrain/site-terrain.service', () => ({
  createDefaultSiteTerrainService: () => ({ fetchSitePack }),
}));

describe('site-terrain routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/site-terrain', siteTerrainRouter);

  beforeEach(() => {
    fetchSitePack.mockReset();
  });

  it('POST /fetch returns base64 imagery, heightmap, and meta', async () => {
    fetchSitePack.mockResolvedValue({
      imagery: { rgba: Buffer.alloc(16, 128), width: 2, height: 2 },
      elevation: {
        heights: new Float32Array([0, 25, 50, 75]),
        width: 2,
        height: 2,
        minM: 0,
        maxM: 100,
      },
      imageryZoom: 18,
      elevationZoom: 15,
      imageryMetersPerPixel: 0.5,
      bounds: { north: 1, south: 0, east: 1, west: 0 },
      providers: { elevation: 'terrarium', imagery: 'esri-world-imagery' },
      attribution: { elevation: 'Mapzen', imagery: 'Esri' },
    });

    const res = await request(app)
      .post('/site-terrain/fetch')
      .send({ lat: 49.45, lng: -119.6, radiusMeters: 400 });

    expect(res.status).toBe(200);
    expect(res.body.imageryBase64).toBeTruthy();
    expect(res.body.heightmapBase64).toBeTruthy();
    expect(res.body.meta).toMatchObject({
      width: 2,
      height: 2,
      minM: 0,
      maxM: 100,
      worldSizeMeters: 800,
    });
  });

  it('rejects invalid coordinates', async () => {
    const res = await request(app).post('/site-terrain/fetch').send({ lat: 999, lng: 0 });
    expect(res.status).toBe(400);
  });
});
