import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';

// Avoid DB persistence during time-sync in route tests
jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      connection: jest.fn((_table: string) => {
        const mockQueryBuilder: any = {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          insert: jest.fn().mockResolvedValue([1]),
          update: jest.fn().mockResolvedValue(1),
        };
        return mockQueryBuilder;
      }).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1),
        fn: { now: () => new Date() },
      }),
    }),
  },
}));

describe('Internal Gateway Routes', () => {
  let app: any;
  const testData = createMockTestData();

  beforeAll(() => {
    app = createApp();
  });

  it('GET /api/v1/internal/gateway/time-sync requires Facility Admin', async () => {
    await request(app).get('/api/v1/internal/gateway/time-sync').expect(401);
    const res = await request(app)
      .get('/api/v1/internal/gateway/time-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.timeSyncPacket)).toBe(true);
  });

  it('POST /api/v1/internal/gateway/request-time-sync returns packet', async () => {
    const res = await request(app)
      .post('/api/v1/internal/gateway/request-time-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ lock_id: 'lock-1' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/v1/internal/gateway/fallback-pass validates body', async () => {
    await request(app)
      .post('/api/v1/internal/gateway/fallback-pass')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({})
      .expect(400);
  });
});


