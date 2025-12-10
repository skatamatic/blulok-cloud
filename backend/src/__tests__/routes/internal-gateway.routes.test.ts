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
  const syncDeviceInventoryMock = jest.fn().mockResolvedValue({ added: 1, removed: 0, unchanged: 2, errors: [] });
  const updateDeviceStatesMock = jest.fn().mockResolvedValue({ updated: 2, not_found: [], errors: [] });
  return {
    DeviceSyncService: {
      getInstance: jest.fn().mockReturnValue({
        syncGatewayDevices: syncGatewayDevicesMock,
        updateDeviceStatuses: updateDeviceStatusesMock,
        syncDeviceInventory: syncDeviceInventoryMock,
        updateDeviceStates: updateDeviceStatesMock,
      }),
    },
    __mocks: {
      syncGatewayDevicesMock,
      updateDeviceStatusesMock,
      syncDeviceInventoryMock,
      updateDeviceStatesMock,
    },
  };
});

// Access mocks exported by the jest factory above
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deviceSyncModule = require('@/services/device-sync.service') as any;
const { syncGatewayDevicesMock, updateDeviceStatusesMock, syncDeviceInventoryMock, updateDeviceStatesMock } = deviceSyncModule.__mocks;

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

  // ============================================================================
  // NEW ENDPOINTS TESTS
  // ============================================================================

  describe('POST /api/v1/internal/gateway/devices/inventory', () => {
    beforeEach(() => {
      syncDeviceInventoryMock.mockClear();
    });

    it('requires authentication', async () => {
      await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .send({ devices: [] })
        .expect(401);
    });

    it('requires facility_id or header', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ devices: [{ lock_id: 'lock-1' }] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('facility_id');
    });

    it('validates that lock_id is required', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'fac-1',
          devices: [{ lock_number: 123 }], // Missing lock_id
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('performs inventory sync successfully', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'fac-1',
          devices: [
            { lock_id: 'lock-1', lock_number: 101, firmware_version: '1.0.0' },
            { lock_id: 'lock-2', lock_number: 102 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Inventory sync completed');
      expect(res.body.data.added).toBe(1);
      expect(res.body.data.unchanged).toBe(2);
      expect(syncDeviceInventoryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/v1/internal/gateway/devices/state', () => {
    beforeEach(() => {
      updateDeviceStatesMock.mockClear();
    });

    it('requires authentication', async () => {
      await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .send({ updates: [] })
        .expect(401);
    });

    it('requires facility_id or header', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ updates: [{ lock_id: 'lock-1', battery_level: 85 }] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('facility_id');
    });

    it('validates lock_state enum values', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'fac-1',
          updates: [{ lock_id: 'lock-1', lock_state: 'INVALID' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('accepts battery_level in mV (no longer 0-100 range)', async () => {
      // Battery level is now in mV (e.g., 3423) not percentage
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'fac-1',
          updates: [{ lock_id: 'lock-1', battery_level: 3423, battery_unit: 'mV' }],
        });

      // Should be accepted (200) since we removed the 0-100 validation
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts partial updates with only some fields', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'fac-1',
          updates: [
            { lock_id: 'lock-1', battery_level: 85 },
            { lock_id: 'lock-2', lock_state: 'LOCKED', online: true },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('State updates applied');
      expect(res.body.data.updated).toBe(2);
      expect(updateDeviceStatesMock).toHaveBeenCalledTimes(1);
    });

    it('accepts full state update with all fields', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'fac-1',
          updates: [
            {
              lock_id: 'lock-1',
              lock_state: 'LOCKED',
              battery_level: 85,
              online: true,
              signal_strength: -65,
              temperature: 22.5,
              firmware_version: '1.2.3',
              last_seen: '2025-12-10T14:30:00.000Z',
              error_code: null,
              error_message: null,
              source: 'GATEWAY',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Deprecated device-sync endpoint', () => {
    it('returns X-Deprecated header', async () => {
      syncGatewayDevicesMock.mockClear();
      updateDeviceStatusesMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/device-sync')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'fac-1',
          devices: [{ serial: 'DEV-1' }],
        });

      expect(res.status).toBe(200);
      expect(res.headers['x-deprecated']).toBe('Use /devices/inventory and /devices/state');
      expect(res.body.message).toContain('deprecated');
    });
  });
});


