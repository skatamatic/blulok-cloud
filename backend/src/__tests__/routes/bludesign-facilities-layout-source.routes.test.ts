import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';
import { FacilityService } from '@/bludesign/services/facility.service';
import { NotFoundError } from '@/middleware/error.middleware';

describe('BluDesign facilities layout-source routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;
  let loadLayoutSource: jest.Mock;
  let saveLayoutSource: jest.Mock;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
    loadLayoutSource = jest.fn();
    saveLayoutSource = jest.fn();

    jest.spyOn(FacilityService.prototype, 'loadLayoutSource').mockImplementation(loadLayoutSource);
    jest.spyOn(FacilityService.prototype, 'saveLayoutSource').mockImplementation(saveLayoutSource);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/v1/bludesign/facilities/:id/layout-source', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .get('/api/v1/bludesign/facilities/fac-1/layout-source')
        .expect(401);

      expectUnauthorized(response);
    });

    it('returns PNG bytes when layout source exists', async () => {
      const png = Buffer.from('fake-png');
      loadLayoutSource.mockResolvedValue(png);

      const response = await request(app)
        .get('/api/v1/bludesign/facilities/fac-1/layout-source')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/image\/png/);
      expect(response.body).toEqual(png);
      expect(loadLayoutSource).toHaveBeenCalledWith('fac-1', testData.users.tenant.id);
    });

    it('returns 404 when layout source is missing', async () => {
      loadLayoutSource.mockRejectedValue(new Error('NOT_FOUND'));

      const response = await request(app)
        .get('/api/v1/bludesign/facilities/fac-1/layout-source')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(404);

      expect(response.body.error).toMatch(/not found/i);
    });
  });

  describe('PUT /api/v1/bludesign/facilities/:id/layout-source', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .put('/api/v1/bludesign/facilities/fac-1/layout-source')
        .expect(401);

      expectUnauthorized(response);
    });

    it('returns 400 when no file uploaded', async () => {
      const response = await request(app)
        .put('/api/v1/bludesign/facilities/fac-1/layout-source')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(400);

      expect(response.body.error).toMatch(/no file/i);
    });

    it('uploads PNG and returns success', async () => {
      saveLayoutSource.mockResolvedValue(undefined);
      const png = Buffer.from('uploaded-png');

      const response = await request(app)
        .put('/api/v1/bludesign/facilities/fac-1/layout-source')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .attach('file', png, { filename: 'layout-source.png', contentType: 'image/png' })
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
      expect(saveLayoutSource).toHaveBeenCalledWith('fac-1', testData.users.tenant.id, png);
    });

    it('returns 404 when facility does not exist on upload', async () => {
      saveLayoutSource.mockRejectedValue(new NotFoundError('Facility'));
      const png = Buffer.from('uploaded-png');

      const response = await request(app)
        .put('/api/v1/bludesign/facilities/missing/layout-source')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .attach('file', png, { filename: 'layout-source.png', contentType: 'image/png' })
        .expect(404);

      expect(response.body.error).toMatch(/not found/i);
    });
  });
});
