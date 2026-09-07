import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectForbidden,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';
import { BluDesignProjectModel } from '@/bludesign/models/bludesign-project.model';
import { BluDesignAssetModel } from '@/bludesign/models/bludesign-asset.model';

describe('BluDesign projects & assets routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/v1/bludesign/projects', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/v1/bludesign/projects').expect(401);
      expectUnauthorized(response);
    });

    it('returns 200 for authenticated user with projects array', async () => {
      jest.spyOn(BluDesignProjectModel, 'findByOwner').mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/bludesign/projects')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.projects)).toBe(true);
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('GET /api/v1/bludesign/projects/:id', () => {
    it('returns 404 when project does not exist', async () => {
      const response = await request(app)
        .get('/api/v1/bludesign/projects/non-existent-project-id')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('returns 403 when project belongs to another user', async () => {
      jest.spyOn(BluDesignProjectModel, 'findById').mockResolvedValue({
        id: 'proj-1',
        name: 'Other',
        ownerId: 'someone-else',
        storageProvider: 'local',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const response = await request(app)
        .get('/api/v1/bludesign/projects/proj-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/Access denied/i);
    });
  });

  describe('GET /api/v1/bludesign/projects/:projectId/assets', () => {
    it('returns 403 when user is not project owner', async () => {
      jest.spyOn(BluDesignProjectModel, 'isOwner').mockResolvedValue(false);

      const response = await request(app)
        .get('/api/v1/bludesign/projects/proj-1/assets')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
      expect(response.body.message).toMatch(/Access denied/i);
    });

    it('returns 200 with assets when user owns project', async () => {
      jest.spyOn(BluDesignProjectModel, 'isOwner').mockResolvedValue(true);
      jest.spyOn(BluDesignAssetModel, 'findByProject').mockResolvedValue([]);
      jest.spyOn(BluDesignAssetModel, 'countByProject').mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/bludesign/projects/proj-1/assets')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.assets)).toBe(true);
      expect(response.body.total).toBe(0);
    });
  });
});
