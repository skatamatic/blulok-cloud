import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess } from '@/__tests__/utils/mock-test-helpers';

describe('Access History Stats Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  describe('GET /api/v1/access-history/stats/activity', () => {
    it('should return activity stats for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .query({ period: 'month' });

      expectSuccess(response);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('period', 'month');
      expect(response.body).toHaveProperty('startDate');
      expect(response.body).toHaveProperty('endDate');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should validate period parameter', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .query({ period: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid period');
    });

    it('should accept day period', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .query({ period: 'day' });

      expectSuccess(response);
      expect(response.body.period).toBe('day');
    });

    it('should accept week period', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .query({ period: 'week' });

      expectSuccess(response);
      expect(response.body.period).toBe('week');
    });

    it('should accept year period', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .query({ period: 'year' });

      expectSuccess(response);
      expect(response.body.period).toBe('year');
    });

    it('should default to month period when not specified', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectSuccess(response);
      expect(response.body.period).toBe('month');
    });

    it('should return empty data for tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .query({ period: 'month' });

      expectSuccess(response);
      expect(response.body.data).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .query({ period: 'month' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return date range in response', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .query({ period: 'week' });

      expectSuccess(response);
      expect(response.body.startDate).toBeDefined();
      expect(response.body.endDate).toBeDefined();
      
      // Verify the date range is approximately 7 days for week period
      const startDate = new Date(response.body.startDate);
      const endDate = new Date(response.body.endDate);
      const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(6);
      expect(diffDays).toBeLessThanOrEqual(8);
    });

    it('should filter by facility_ids for facility admin', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .query({ period: 'month' });

      expectSuccess(response);
      // Facility admin should get data, potentially empty if no logs
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should accept facility_ids filter', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/stats/activity')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .query({ 
          period: 'month',
          facility_ids: [testData.facilities.facility1.id]
        });

      expectSuccess(response);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});
