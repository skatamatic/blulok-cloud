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

// Mock GatewayModel to avoid hitting real DB in device-sync route
jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: jest.fn().mockResolvedValue({ id: 'gateway-1' }),
  })),
}));

// Mock DeviceSyncService to assert how device-sync normalizes payloads
jest.mock('@/services/device-sync.service', () => {
  const syncGatewayDevicesMock = jest.fn().mockResolvedValue(undefined);
  const updateDeviceStatusesMock = jest.fn().mockResolvedValue(undefined);
  return {
    DeviceSyncService: {
      getInstance: jest.fn().mockReturnValue({
        syncGatewayDevices: syncGatewayDevicesMock,
        updateDeviceStatuses: updateDeviceStatusesMock,
      }),
    },
    __mocks: {
      syncGatewayDevicesMock,
      updateDeviceStatusesMock,
    },
  };
});

// Access mocks exported by the jest factory above
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deviceSyncModule = require('@/services/device-sync.service') as any;
const { syncGatewayDevicesMock, updateDeviceStatusesMock } = deviceSyncModule.__mocks;

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
    expect(typeof res.body.timeSyncJwt).toBe('string');
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

  it('POST /api/v1/internal/gateway/device-sync requires facility_id or header and valid identifiers', async () => {
    // Missing facility_id and header should be rejected
    const resMissingFacility = await request(app)
      .post('/api/v1/internal/gateway/device-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ devices: [{ serial: 'DEV-1' }] });

    expect(resMissingFacility.status).toBe(400);
    expect(resMissingFacility.body.success).toBe(false);

    // Device without any identifier should be rejected by Joi
    const resNoIds = await request(app)
      .post('/api/v1/internal/gateway/device-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({
        facility_id: 'fac-1',
        devices: [{ batteryLevel: 10 }],
      });

    expect(resNoIds.status).toBe(400);
    expect(resNoIds.body.success).toBe(false);
    expect(String(resNoIds.body.message || '')).toContain('serial');
  });

  it('POST /api/v1/internal/gateway/device-sync normalizes payload and forwards to DeviceSyncService', async () => {
    syncGatewayDevicesMock.mockClear();
    updateDeviceStatusesMock.mockClear();

    const devicePayload = {
      lockId: 'lock-123',
      lock_id: 'lock-ignored',
      serial: 'SER-123',
      firmwareVersion: '1.2.3',
      online: true,
      locked: false,
      batteryLevel: 75,
      lastSeen: '2025-11-24T16:58:19.618Z',
      lockNumber: 495,
      batteryUnit: '%',
      signalStrength: 42,
      temperatureValue: 10.5,
      temperatureUnit: 'C',
      someExtraField: 'keep-me',
    };

    const res = await request(app)
      .post('/api/v1/internal/gateway/device-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({
        facility_id: 'fac-1',
        devices: [devicePayload],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(syncGatewayDevicesMock).toHaveBeenCalledTimes(1);
    expect(updateDeviceStatusesMock).toHaveBeenCalledTimes(1);

    const [, syncedDevices] = syncGatewayDevicesMock.mock.calls[0];
    expect(Array.isArray(syncedDevices)).toBe(true);
    expect(syncedDevices).toHaveLength(1);

    const normalized = syncedDevices[0];
    // Identifiers are passed through; lockId prefers original lockId over lock_id
    expect(normalized.serial).toBe(devicePayload.serial);
    expect(normalized.lockId).toBe(devicePayload.lockId);

    // Numeric telemetry is preserved
    expect(normalized.batteryLevel).toBe(devicePayload.batteryLevel);
    expect(normalized.signalStrength).toBe(devicePayload.signalStrength);

    // temperatureValue is normalized to temperature while original field is preserved via spread
    expect(normalized.temperature).toBe(devicePayload.temperatureValue);

    // lastSeen is converted to Date instance
    expect(normalized.lastSeen).toBeInstanceOf(Date);

    // Extra fields should still be present on the object (unknown(true))
    expect(normalized.lockNumber).toBe(devicePayload.lockNumber);
    expect(normalized.someExtraField).toBe(devicePayload.someExtraField);
  });
});


