import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { TimeSyncJwtPayload } from '@/types/gateway.types';
import { AuthService } from '@/services/auth.service';

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

// Mock GatewayModel to avoid hitting real DB in inventory routes
jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: jest.fn().mockResolvedValue({ id: 'gateway-1' }),
  })),
}));

const ingestMock = jest.fn();
const recordSystemEventSafeMock = jest.fn();
jest.mock('@/services/gateway-telemetry-log.service', () => ({
  GatewayTelemetryLogService: {
    getInstance: jest.fn().mockReturnValue({
      ingest: (...args: unknown[]) => ingestMock(...args),
      recordSystemEventSafe: (...args: unknown[]) => recordSystemEventSafeMock(...args),
    }),
  },
}));

const isBlockingActiveForFacilityMock = jest.fn().mockResolvedValue(false);
const isProductionInventorySeedArmedMock = jest.fn().mockReturnValue(false);
const isProductionInventorySeedAllowedMock = jest.fn().mockReturnValue(false);
const completeProductionInventorySeedMock = jest.fn();
jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    isBlockingActiveForFacility: (...args: unknown[]) => isBlockingActiveForFacilityMock(...args),
    isProductionInventorySeedArmed: (...args: unknown[]) => isProductionInventorySeedArmedMock(...args),
    isProductionInventorySeedAllowed: (...args: unknown[]) => isProductionInventorySeedAllowedMock(...args),
    completeProductionInventorySeed: (...args: unknown[]) => completeProductionInventorySeedMock(...args),
  },
}));

const broadcastUnitsUpdateMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: jest.fn().mockReturnValue({
      broadcastUnitsUpdate: (...args: unknown[]) => broadcastUnitsUpdateMock(...args),
    }),
  },
}));

jest.mock('@/services/device-sync.service', () => {
  const syncGatewayDevicesMock = jest.fn().mockResolvedValue(undefined);
  const updateDeviceStatusesMock = jest.fn().mockResolvedValue(undefined);
  const syncDeviceInventoryMock = jest.fn().mockResolvedValue({ added: 1, removed: 0, unchanged: 2, errors: [] });
  const syncAccessDeviceInventoryMock = jest.fn().mockResolvedValue({ added: 1, removed: 0, unchanged: 0, errors: [] });
  const updateDeviceStatesMock = jest.fn().mockResolvedValue({ updated: 2, not_found: [], errors: [] });
  const updateAccessDeviceStatesMock = jest.fn().mockResolvedValue({ updated: 1, not_found: [], errors: [] });
  return {
    DeviceSyncService: {
      getInstance: jest.fn().mockReturnValue({
        syncGatewayDevices: syncGatewayDevicesMock,
        updateDeviceStatuses: updateDeviceStatusesMock,
        syncDeviceInventory: syncDeviceInventoryMock,
        syncAccessDeviceInventory: syncAccessDeviceInventoryMock,
        updateDeviceStates: updateDeviceStatesMock,
        updateAccessDeviceStates: updateAccessDeviceStatesMock,
      }),
    },
    __mocks: {
      syncGatewayDevicesMock,
      updateDeviceStatusesMock,
      syncDeviceInventoryMock,
      syncAccessDeviceInventoryMock,
      updateDeviceStatesMock,
      updateAccessDeviceStatesMock,
    },
  };
});

const syncNetworkInfraInventoryMock = jest.fn().mockResolvedValue({
  added: 0,
  removed: 0,
  unchanged: 0,
  updated: 0,
  errors: [],
});
const updateNetworkInfraDeviceStatesMock = jest.fn().mockResolvedValue({
  updated: 1,
  not_found: [],
  errors: [],
});
const applyGatewayInventoryUpdateMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/gateway-inventory-device-sync.service', () => ({
  GatewayInventoryDeviceSyncService: {
    getInstance: jest.fn().mockReturnValue({
      syncNetworkInfraInventory: (...args: unknown[]) => syncNetworkInfraInventoryMock(...args),
      updateNetworkInfraDeviceStates: (...args: unknown[]) =>
        updateNetworkInfraDeviceStatesMock(...args),
      applyGatewayInventoryUpdate: (...args: unknown[]) => applyGatewayInventoryUpdateMock(...args),
    }),
  },
}));

const recordInventorySyncMock = jest.fn().mockResolvedValue({
  id: 'sync-log-1',
  gateway_id: 'gateway-1',
  facility_id: 'facility-1',
  sync_kind: 'inventory',
  source: 'gateway_ws',
  summary: {},
  entries: [],
  created_at: new Date(),
});

jest.mock('@/services/gateway-device-sync-log.service', () => ({
  GatewayDeviceSyncLogService: {
    getInstance: jest.fn().mockReturnValue({
      recordInventorySync: (...args: unknown[]) => recordInventorySyncMock(...args),
    }),
  },
}));

const buildOperationalSyncForGatewayMock = jest.fn().mockResolvedValue([
  {
    cloud_device_id: 'lock-uuid-1',
    kind: 'lock',
    serial: 'lock-1',
    denylist: [{ sub: 'tenant-1', exp: 9999999999 }],
  },
]);
jest.mock('@/services/denylist-sync.service', () => ({
  DenylistSyncService: {
    buildOperationalSyncForGateway: (...args: unknown[]) => buildOperationalSyncForGatewayMock(...args),
  },
}));

// Access mocks exported by the jest factory above
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deviceSyncModule = require('@/services/device-sync.service');
const {
  syncGatewayDevicesMock,
  updateDeviceStatusesMock,
  syncDeviceInventoryMock,
  syncAccessDeviceInventoryMock,
  updateDeviceStatesMock,
  updateAccessDeviceStatesMock,
} = deviceSyncModule.__mocks;

describe('Internal Gateway Routes', () => {
  let app: any;
  let accessSpy: jest.SpyInstance;
  const testData = createMockTestData();

  beforeAll(() => {
    accessSpy = jest.spyOn(AuthService, 'canAccessFacility').mockImplementation(async (_userId, _userRole, facilityId) => {
      return facilityId === 'facility-1' || facilityId === '550e8400-e29b-41d4-a716-446655440001';
    });
    app = createApp();
  });

  afterAll(() => {
    accessSpy.mockRestore();
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

  it('POST /api/v1/internal/gateway/request-time-sync includes lock_id in returned JWT', async () => {
    const lockId = 'lock-test-123';
    const res = await request(app)
      .post('/api/v1/internal/gateway/request-time-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ lock_id: lockId })
      .expect(200);
    
    expect(res.body.success).toBe(true);
    expect(typeof res.body.timeSyncJwt).toBe('string');

    const claims = await Ed25519Service.verifyJwt(res.body.timeSyncJwt) as TimeSyncJwtPayload;
    expect(claims.cmd_type).toBe('SECURE_TIME_SYNC');
    expect(claims.iss).toBe('BluCloud:Root');
    expect(claims.lock_id).toBe(lockId);
    expect(typeof claims.ts).toBe('number');
  });

  it('POST /api/v1/internal/gateway/request-time-sync JWT payload contains lock_id matching request body', async () => {
    const lockId = 'lock-abc-456';
    const res = await request(app)
      .post('/api/v1/internal/gateway/request-time-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ lock_id: lockId })
      .expect(200);
    
    const claims = await Ed25519Service.verifyJwt(res.body.timeSyncJwt) as TimeSyncJwtPayload;
    expect(claims.lock_id).toBe(lockId);
  });

  it('POST /api/v1/internal/gateway/fallback-pass validates body', async () => {
    await request(app)
      .post('/api/v1/internal/gateway/fallback-pass')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({})
      .expect(400);
  });

  // ============================================================================
  // Device inventory + state
  // ============================================================================

  it('POST /api/v1/internal/gateway/device-sync is removed (use inventory + state)', async () => {
    const res = await request(app)
      .post('/api/v1/internal/gateway/device-sync')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ facility_id: 'facility-1', devices: [] });
    expect(res.status).toBe(404);
  });

  describe('POST /api/v1/internal/gateway/devices/inventory', () => {
    beforeEach(() => {
      syncDeviceInventoryMock.mockClear();
      broadcastUnitsUpdateMock.mockClear();
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
        .send({ devices: [{ kind: 'lock', lock_id: 'lock-1' }] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('facility_id');
    });

    it('validates that lock_id is required', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [{ lock_number: 123 }], // Missing lock_id
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects blank lock_id values', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [{ kind: 'lock', lock_id: '   ' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('performs inventory sync successfully', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [
            { kind: 'lock', lock_id: 'lock-1', lock_number: 101, firmware_version: '1.0.0' },
            { kind: 'lock', lock_id: 'lock-2', lock_number: 102 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Inventory sync completed');
      expect(res.body.data.added).toBe(1);
      expect(res.body.data.unchanged).toBe(2);
      expect(res.body.data.operational_devices).toEqual([
        {
          cloud_device_id: 'lock-uuid-1',
          kind: 'lock',
          serial: 'lock-1',
          denylist: [{ sub: 'tenant-1', exp: 9999999999 }],
        },
      ]);
      expect(buildOperationalSyncForGatewayMock).toHaveBeenCalledWith('gateway-1');
      expect(syncDeviceInventoryMock).toHaveBeenCalledTimes(1);
      expect(recordInventorySyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: 'gateway-1',
          facilityId: 'facility-1',
          source: 'gateway_ws',
        }),
      );
      expect(recordSystemEventSafeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'device_inventory_sync_completed',
          facility_id: 'facility-1',
          gateway_id: 'gateway-1',
        }),
      );
      expect(broadcastUnitsUpdateMock).toHaveBeenCalledTimes(1);
    });

    it('applies gateway self inventory row to bound gateway record', async () => {
      applyGatewayInventoryUpdateMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [
            { kind: 'gateway', serial: 'AA:BB:CC:DD:EE:FF', firmware_version: '2.4.1', state: 'healthy' },
          ],
        });

      expect(res.status).toBe(200);
      expect(applyGatewayInventoryUpdateMock).toHaveBeenCalledWith(
        'gateway-1',
        expect.objectContaining({ kind: 'gateway', firmware_version: '2.4.1' }),
      );
    });

    it('returns 409 when gateway recovery is blocking inventory sync', async () => {
      isBlockingActiveForFacilityMock.mockResolvedValueOnce(true);
      isProductionInventorySeedAllowedMock.mockReturnValueOnce(false);
      syncDeviceInventoryMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [{ kind: 'lock', lock_id: 'lock-1' }],
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('recovery_in_progress');
      expect(syncDeviceInventoryMock).not.toHaveBeenCalled();
    });

    it('allows bound production gateway inventory sync during pre-snapshot seed', async () => {
      isBlockingActiveForFacilityMock.mockResolvedValueOnce(true);
      isProductionInventorySeedAllowedMock.mockReturnValueOnce(true);
      completeProductionInventorySeedMock.mockClear();
      syncDeviceInventoryMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Session-Role', 'active')
        .set('X-Gateway-Id', 'gateway-1')
        .send({
          facility_id: 'facility-1',
          devices: [{ kind: 'lock', lock_id: 'sim-lock-1' }],
        });

      expect(res.status).toBe(200);
      expect(syncDeviceInventoryMock).toHaveBeenCalledTimes(1);
      expect(completeProductionInventorySeedMock).toHaveBeenCalledWith('facility-1');
    });

    it('returns 403 when inventory sync is proxied from a swap candidate session', async () => {
      syncDeviceInventoryMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Session-Role', 'swap_candidate')
        .set('X-Gateway-Id', 'gateway-swap')
        .send({
          facility_id: 'facility-1',
          devices: [{ kind: 'lock', lock_id: 'lock-1' }],
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('not_bound_gateway');
      expect(syncDeviceInventoryMock).not.toHaveBeenCalled();
    });

    it('enforces facility scope for inventory sync', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-2',
          devices: [{ kind: 'lock', lock_id: 'lock-1' }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('requires access_id for access_control inventory items', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [{ kind: 'access_control', relay_channel: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('requires kind on lock inventory items', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [{ lock_id: 'lock-1', lock_number: 101 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects device_serial alias on access_control inventory items', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [{ kind: 'access_control', device_serial: 'KP-ALIAS', relay_channel: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('accepts access_control inventory without relay_channel (defaults to 1)', async () => {
      syncAccessDeviceInventoryMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [{
            kind: 'access_control',
            access_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
            online: false,
            last_seen: '2026-05-29T14:08:18.852437Z',
          }],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(syncAccessDeviceInventoryMock).toHaveBeenCalledWith(
        'gateway-1',
        'facility-1',
        [expect.objectContaining({
          access_id: 'f759bd50-a70e-5bba-81c5-25e9a7c695c1',
          relay_channel: 1,
        })],
      );
    });

    it('performs mixed lock and access_control inventory sync', async () => {
      syncDeviceInventoryMock.mockClear();
      syncAccessDeviceInventoryMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [
            { kind: 'lock', lock_id: 'lock-1' },
            { kind: 'access_control', access_id: 'KP-004', relay_channel: 4 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.access_control).toBeDefined();
      expect(syncDeviceInventoryMock).toHaveBeenCalledTimes(1);
      expect(syncAccessDeviceInventoryMock).toHaveBeenCalledTimes(1);
      expect(syncAccessDeviceInventoryMock).toHaveBeenCalledWith(
        'gateway-1',
        'facility-1',
        [expect.objectContaining({ access_id: 'KP-004', relay_channel: 4 })]
      );
    });

    it('accepts same access_id on multiple relay channels in one inventory payload', async () => {
      syncAccessDeviceInventoryMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          devices: [
            { kind: 'access_control', access_id: 'KP-SHARED', relay_channel: 1 },
            { kind: 'access_control', access_id: 'KP-SHARED', relay_channel: 2 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(syncAccessDeviceInventoryMock).toHaveBeenCalledWith(
        'gateway-1',
        'facility-1',
        [
          expect.objectContaining({ access_id: 'KP-SHARED', relay_channel: 1 }),
          expect.objectContaining({ access_id: 'KP-SHARED', relay_channel: 2 }),
        ],
      );
    });
  });

  describe('POST /api/v1/internal/gateway/devices/state', () => {
    beforeEach(() => {
      updateDeviceStatesMock.mockClear();
      broadcastUnitsUpdateMock.mockClear();
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
        .send({ updates: [{ kind: 'lock', lock_id: 'lock-1', battery_level: 85 }] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('facility_id');
    });

    it('returns 409 when gateway recovery is blocking state sync', async () => {
      isBlockingActiveForFacilityMock.mockResolvedValueOnce(true);
      updateDeviceStatesMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [{ kind: 'lock', lock_id: 'lock-1', state: 'CLOSED' }],
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('recovery_in_progress');
      expect(updateDeviceStatesMock).not.toHaveBeenCalled();
    });

    it('returns 403 when state sync is proxied from a swap candidate session', async () => {
      updateDeviceStatesMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Session-Role', 'swap_candidate')
        .set('X-Gateway-Id', 'gateway-swap')
        .send({
          facility_id: 'facility-1',
          updates: [{ kind: 'lock', lock_id: 'lock-1', state: 'CLOSED' }],
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('not_bound_gateway');
      expect(updateDeviceStatesMock).not.toHaveBeenCalled();
    });

    it('validates state enum values', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [{ kind: 'lock', lock_id: 'lock-1', state: 'INVALID' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects blank lock_id on state updates', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [{ kind: 'lock', lock_id: '   ', state: 'CLOSED' }],
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
          facility_id: 'facility-1',
          updates: [{ kind: 'lock', lock_id: 'lock-1', battery_level: 3423, battery_unit: 'mV' }],
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
          facility_id: 'facility-1',
          updates: [
            { kind: 'lock', lock_id: 'lock-1', battery_level: 85 },
            { kind: 'lock', lock_id: 'lock-2', state: 'CLOSED', online: true },
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
          facility_id: 'facility-1',
          updates: [
            {
              kind: 'lock',
              lock_id: 'lock-1',
              state: 'CLOSED',
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

    it('accepts state update with serial field', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [
            {
              kind: 'lock',
              lock_id: 'lock-1',
              serial: 'LOCK-ABC-105',
              state: 'CLOSED',
              battery_level: 90,
              online: false,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(updateDeviceStatesMock).toHaveBeenCalledTimes(1);
      
      // Verify serial is passed to the service
      const [gatewayId, updates] = updateDeviceStatesMock.mock.calls[0];
      expect(updates[0].serial).toBe('LOCK-ABC-105');
    });

    it('enforces facility scope for state updates', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-2',
          updates: [{ kind: 'lock', lock_id: 'lock-1', online: true }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('performs mixed lock and access_control state updates', async () => {
      updateDeviceStatesMock.mockClear();
      updateAccessDeviceStatesMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [
            { kind: 'lock', lock_id: 'lock-1', online: true },
            { kind: 'access_control', access_id: 'KP-002', relay_channel: 2, locked: true },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.access_control).toBeDefined();
      expect(updateDeviceStatesMock).toHaveBeenCalledTimes(1);
      expect(updateAccessDeviceStatesMock).toHaveBeenCalledTimes(1);
    });

    it('performs mixed lock, access_control, and network infra state updates', async () => {
      updateDeviceStatesMock.mockClear();
      updateAccessDeviceStatesMock.mockClear();
      updateNetworkInfraDeviceStatesMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [
            { kind: 'lock', lock_id: 'lock-1', online: true },
            { kind: 'access_control', access_id: 'KP-002', relay_channel: 2, locked: true },
            { kind: 'bridge', serial: 'BR-1', state: 'healthy' },
            { kind: 'friend_node', serial: 'FN-1', last_seen: '2026-06-18T15:44:54.349684Z' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.access_control).toBeDefined();
      expect(res.body.data.network_infra).toBeDefined();
      expect(updateDeviceStatesMock).toHaveBeenCalledTimes(1);
      expect(updateAccessDeviceStatesMock).toHaveBeenCalledTimes(1);
      expect(updateNetworkInfraDeviceStatesMock).toHaveBeenCalledWith(
        'gateway-1',
        expect.arrayContaining([
          { kind: 'bridge', serial: 'BR-1', state: 'healthy' },
          expect.objectContaining({
            kind: 'friend_node',
            serial: 'FN-1',
            last_seen: '2026-06-18T15:44:54.349Z',
          }),
        ]),
      );
    });

    it('accepts friend_node state with null firmware_version', async () => {
      updateNetworkInfraDeviceStatesMock.mockClear();

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [
            {
              kind: 'friend_node',
              serial: '/192.168.3.176:35919',
              state: 'online',
              firmware_version: null,
              last_seen: '2026-06-18T15:44:54.349684Z',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(updateNetworkInfraDeviceStatesMock).toHaveBeenCalledTimes(1);
    });

    it('rejects unsupported kinds on state updates', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [{ kind: 'gateway', serial: 'GW-1', state: 'healthy' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('tid (transaction ID) support for gateway proxy correlation', () => {
    it('accepts tid on request-time-sync', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/request-time-sync')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ lock_id: 'lock-1', tid: 42 })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts tid as string on request-time-sync', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/request-time-sync')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ lock_id: 'lock-1', tid: 'tx-abc' })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts tid on fallback-pass', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/fallback-pass')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ fallbackJwt: 'fake-jwt', tid: 7 });
      // Will fail on JWT verification (400/500), but NOT on "tid is not allowed"
      expect(res.body.message).not.toContain('"tid" is not allowed');
    });

    it('accepts tid on devices/inventory', async () => {
      syncDeviceInventoryMock.mockClear();
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/inventory')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ facility_id: 'facility-1', tid: 5, devices: [{ kind: 'lock', lock_id: 'lock-1' }] })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts tid on devices/state', async () => {
      updateDeviceStatesMock.mockClear();
      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ facility_id: 'facility-1', tid: 'tx-99', updates: [{ kind: 'lock', lock_id: 'lock-1', online: true }] })
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('broadcasts units_update after state updates for live device lists', async () => {
      updateDeviceStatesMock.mockResolvedValueOnce({ updated: 1, not_found: [], errors: [] });

      const res = await request(app)
        .post('/api/v1/internal/gateway/devices/state')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          updates: [{ kind: 'lock', lock_id: 'lock-1', online: false }],
        });

      expect(res.status).toBe(200);
      expect(broadcastUnitsUpdateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/v1/internal/gateway/add_log', () => {
    beforeEach(() => {
      ingestMock.mockReset();
      ingestMock.mockResolvedValue([
        {
          id: 'log-1',
          gateway_id: 'gateway-1',
          facility_id: 'facility-1',
          logged_at: new Date(),
          payload: { message: 'hello' },
          source: 'gateway_ws',
          created_at: new Date(),
        },
      ]);
    });

    it('ingests a single message', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/add_log')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Facility-Id', 'facility-1')
        .send({ message: '2026-05-26T09:53:21.653711 Gateway heartbeat OK', tid: 42 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.ingested).toBe(1);
      expect(res.body.data.tid).toBe(42);
      expect(ingestMock).toHaveBeenCalledWith(
        'facility-1',
        'gateway-1',
        ['2026-05-26T09:53:21.653711 Gateway heartbeat OK'],
      );
    });

    it('ingests messages array', async () => {
      await request(app)
        .post('/api/v1/internal/gateway/add_log')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Facility-Id', 'facility-1')
        .send({ messages: ['line-a', 'line-b'] })
        .expect(200);

      expect(ingestMock).toHaveBeenCalledWith('facility-1', 'gateway-1', ['line-a', 'line-b']);
    });

    it('accepts raw string JSON body', async () => {
      await request(app)
        .post('/api/v1/internal/gateway/add_log')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Facility-Id', 'facility-1')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ message: 'raw string body line' }))
        .expect(200);

      expect(ingestMock).toHaveBeenCalledWith('facility-1', 'gateway-1', ['raw string body line']);
    });

    it('accepts PROXY-style JSON string log line body', async () => {
      const line = '2026-05-26T09:53:21.653711 Gateway heartbeat OK';
      await request(app)
        .post('/api/v1/internal/gateway/add_log')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Facility-Id', 'facility-1')
        .send({ message: line })
        .expect(200);

      expect(ingestMock).toHaveBeenCalledWith('facility-1', 'gateway-1', [line]);
    });

    it('rejects facility_id override for facility admin', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/add_log')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Facility-Id', 'facility-1')
        .send({ message: 'line', facility_id: '550e8400-e29b-41d4-a716-446655440099' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(ingestMock).not.toHaveBeenCalled();
    });

    it('rejects batches over the ingest limit', async () => {
      const messages = Array.from({ length: 501 }, (_, i) => `line-${i}`);
      const res = await request(app)
        .post('/api/v1/internal/gateway/add_log')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Facility-Id', 'facility-1')
        .send({ messages })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(ingestMock).not.toHaveBeenCalled();
    });

    it('rejects invalid body', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/add_log')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .set('X-Gateway-Facility-Id', 'facility-1')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/internal/gateway/access-events', () => {
    it('ingests a valid access event payload', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/access-events')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          events: [
            {
              event_id: 'event-1',
              occurred_at: new Date().toISOString(),
              facility_id: 'facility-1',
              device_id: 'device-1',
              action: 'access_granted',
              method: 'app',
              success: true,
              actor: {
                user_id: 'tenant-1',
                role: 'tenant',
                name: 'Tenant User',
              },
            },
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.ingested).toBe(1);
      expect(Array.isArray(res.body.data.activity_ids)).toBe(true);
    });

    it('rejects denied events missing denial_reason', async () => {
      const res = await request(app)
        .post('/api/v1/internal/gateway/access-events')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facility_id: 'facility-1',
          events: [
            {
              event_id: 'event-2',
              occurred_at: new Date().toISOString(),
              facility_id: 'facility-1',
              device_id: 'device-1',
              action: 'access_denied',
              method: 'app',
              success: false,
            },
          ],
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});

