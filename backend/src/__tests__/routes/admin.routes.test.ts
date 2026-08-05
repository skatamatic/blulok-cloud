jest.mock('@/services/device-deletion-outbox.service', () => ({
  DeviceDeletionOutboxService: {
    getInstance: jest.fn(() => ({
      findLatestOutboxForBlulok: jest.fn().mockResolvedValue({
        id: 'outbox-1',
        status: 'pending',
        device_kind: 'blulok',
        lock_id: 'LOCK-SN-1',
        access_id: null,
        relay_channel: null,
        attempt_count: 0,
        last_error: null,
      }),
      findLatestOutboxForAccessControl: jest.fn().mockResolvedValue({
        id: 'outbox-2',
        status: 'pending',
        device_kind: 'access_control',
        lock_id: null,
        access_id: 'KP-001',
        relay_channel: 1,
        attempt_count: 1,
        last_error: 'retry',
      }),
    })),
  },
}));

import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectForbidden,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';
import { DatabaseService } from '@/services/database.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { GatewayService } from '@/services/gateway/gateway.service';
import { DenylistService } from '@/services/denylist.service';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { LockCommandService } from '@/services/lock-command.service';
import { config } from '@/config/environment';
import { DeviceDeletionOutboxService } from '@/services/device-deletion-outbox.service';

function createAdminTxnKnex(options?: { unitIds?: string[]; gatewayIds?: string[]; userDeviceIds?: string[] }) {
  const unitIds = options?.unitIds ?? [];
  const gatewayIds = options?.gatewayIds ?? [];
  const userDeviceIds = options?.userDeviceIds ?? [];

  const makeBuilder = () => {
    const builder: any = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(1),
      insert: jest.fn().mockResolvedValue([1]),
      pluck: jest.fn().mockImplementation(async (col: string) => {
        if (col === 'id' && userDeviceIds.length) return userDeviceIds;
        if (col === 'id' && unitIds.length) return unitIds;
        if (col === 'id' && gatewayIds.length) return gatewayIds;
        if (col === 'unit_id') return unitIds;
        return [];
      }),
      del: jest.fn().mockResolvedValue(1),
      delete: jest.fn().mockResolvedValue(1),
    };
    return builder;
  };

  const knex: any = jest.fn((table: string) => {
    const builder = makeBuilder();
    if (table === 'units') {
      builder.pluck = jest.fn().mockResolvedValue(unitIds);
    }
    if (table === 'gateways') {
      builder.pluck = jest.fn().mockResolvedValue(gatewayIds);
    }
    if (table === 'user_devices') {
      builder.pluck = jest.fn().mockResolvedValue(userDeviceIds);
    }
    if (table === 'unit_assignments') {
      builder.pluck = jest.fn().mockResolvedValue(unitIds);
    }
    if (table === 'blulok_devices') {
      builder.pluck = jest.fn().mockResolvedValue(['blulok-1']);
      builder.catch = jest.fn().mockResolvedValue(['blulok-1']);
    }
    if (table === 'device_key_distributions') {
      builder.pluck = jest.fn().mockResolvedValue(userDeviceIds);
      builder.catch = jest.fn().mockResolvedValue(userDeviceIds);
    }
    // Support `.del().catch(() => {})` chains used by hard-delete handlers
    const originalDel = builder.del;
    builder.del = jest.fn(() => {
      const p = Promise.resolve(1);
      (p as any).catch = jest.fn().mockResolvedValue(undefined);
      return Object.assign(p, { catch: jest.fn().mockResolvedValue(undefined) });
    });
    void originalDel;
    return builder;
  });
  knex.transaction = jest.fn(async (cb: (trx: any) => Promise<void>) => cb(knex));
  knex.fn = { now: () => new Date() };
  return knex;
}

describe('Admin Routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
  });

  describe('POST /api/v1/admin/ops-key-rotation/broadcast', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .send({})
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 403 for tenant token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for facility_admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for dev_admin when root_private_key_b64 is missing (managed flow)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(String(response.body.message)).toContain('root_private_key');
    });
  });

  describe('POST /api/v1/admin/rate-limits/bypass', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .send({ enabled: false })
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 403 for admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ enabled: false })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for dev_admin when body fails Joi validation', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBeTruthy();
    });

    it('should return 200 for dev_admin disabling bypass in non-production test env', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ enabled: false })
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/admin/dev-tools/gateway-ping', () => {
    it('should return 403 for admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-ping')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ facilityId: '550e8400-e29b-41d4-a716-446655440001' })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for dev_admin when facilityId is missing', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-ping')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(String(response.body.message)).toBeTruthy();
    });

    it('should return 200 for dev_admin with valid facilityId in non-production test env', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-ping')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ facilityId: '550e8400-e29b-41d4-a716-446655440001' })
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
      expect(response.body.facilityId).toBe('550e8400-e29b-41d4-a716-446655440001');
    });
  });

  describe('POST /api/v1/admin/dev-tools/notifications-test-mode', () => {
    it('should return 403 for admin token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/notifications-test-mode')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ enabled: true })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 200 for dev_admin toggling test mode', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/notifications-test-mode')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ enabled: true })
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/admin/rate-limits/bypass enable path', () => {
    it('should enable bypass for dev_admin with durationSeconds', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ enabled: true, durationSeconds: 60, ip: '127.0.0.1', reason: 'coverage' })
        .expect(200);

      expectSuccess(response);
      expect(response.body.message).toMatch(/enabled/i);
      expect(response.body.expiresAt).toBeTruthy();
    });

    it('should return 403 in production', async () => {
      const prev = config.nodeEnv;
      (config as { nodeEnv: string }).nodeEnv = 'production';
      try {
        const response = await request(app)
          .post('/api/v1/admin/rate-limits/bypass')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send({ enabled: false })
          .expect(403);
        expect(response.body.message).toMatch(/production/i);
      } finally {
        (config as { nodeEnv: string }).nodeEnv = prev;
      }
    });
  });

  describe('POST /api/v1/admin/dev-tools/notifications-test-mode disable + production', () => {
    it('should disable test mode for dev_admin', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/notifications-test-mode')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ enabled: false })
        .expect(200);

      expectSuccess(response);
      expect(response.body.enabled).toBe(false);
    });

    it('should return 400 when enabled is missing', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/notifications-test-mode')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({})
        .expect(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 403 in production', async () => {
      const prev = config.nodeEnv;
      (config as { nodeEnv: string }).nodeEnv = 'production';
      try {
        const response = await request(app)
          .post('/api/v1/admin/dev-tools/notifications-test-mode')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send({ enabled: true })
          .expect(403);
        expect(response.body.message).toMatch(/production/i);
      } finally {
        (config as { nodeEnv: string }).nodeEnv = prev;
      }
    });
  });

  describe('POST /api/v1/admin/dev-tools/gateway-ping production guard', () => {
    it('should return 403 in production', async () => {
      const prev = config.nodeEnv;
      (config as { nodeEnv: string }).nodeEnv = 'production';
      try {
        const response = await request(app)
          .post('/api/v1/admin/dev-tools/gateway-ping')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send({ facilityId: '550e8400-e29b-41d4-a716-446655440001' })
          .expect(403);
        expect(response.body.message).toMatch(/production/i);
      } finally {
        (config as { nodeEnv: string }).nodeEnv = prev;
      }
    });
  });

  describe('GET /api/v1/admin/dev-tools/device-deletion-outbox', () => {
    it('should return 403 for admin (requireDevAdmin)', async () => {
      const response = await request(app)
        .get('/api/v1/admin/dev-tools/device-deletion-outbox')
        .query({ facilityId: '550e8400-e29b-41d4-a716-446655440001', lockId: 'LOCK-1' })
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(403);
      expectForbidden(response);
    });

    it('should return 400 when query fails xor lockId/accessId', async () => {
      const response = await request(app)
        .get('/api/v1/admin/dev-tools/device-deletion-outbox')
        .query({ facilityId: '550e8400-e29b-41d4-a716-446655440001' })
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(400);
      expect(response.body.success).toBe(false);
    });

    it('should return outbox row for lockId', async () => {
      const response = await request(app)
        .get('/api/v1/admin/dev-tools/device-deletion-outbox')
        .query({
          facilityId: '550e8400-e29b-41d4-a716-446655440001',
          lockId: 'LOCK-SN-1',
        })
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.row).toMatchObject({ id: 'outbox-1', lock_id: 'LOCK-SN-1' });
    });

    it('should return outbox row for accessId + relayChannel', async () => {
      const response = await request(app)
        .get('/api/v1/admin/dev-tools/device-deletion-outbox')
        .query({
          facilityId: '550e8400-e29b-41d4-a716-446655440001',
          accessId: 'KP-001',
          relayChannel: 1,
        })
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.row).toMatchObject({ id: 'outbox-2', access_id: 'KP-001' });
    });

    it('should return 403 in production', async () => {
      const prev = config.nodeEnv;
      (config as { nodeEnv: string }).nodeEnv = 'production';
      try {
        const response = await request(app)
          .get('/api/v1/admin/dev-tools/device-deletion-outbox')
          .query({
            facilityId: '550e8400-e29b-41d4-a716-446655440001',
            lockId: 'LOCK-1',
          })
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(403);
        expect(response.body.message).toMatch(/production/i);
      } finally {
        (config as { nodeEnv: string }).nodeEnv = prev;
      }
    });
  });

  describe('DELETE /api/v1/admin/users/:id/hard', () => {
    it('should return 403 for admin', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/users/user-to-delete/hard')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(403);
      expectForbidden(response);
    });

    it('should hard-delete user for dev_admin', async () => {
      const knex = createAdminTxnKnex({ userDeviceIds: ['ud-1'], unitIds: ['unit-1'] });
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: knex });

      const response = await request(app)
        .delete('/api/v1/admin/users/user-to-delete/hard')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.message).toMatch(/hard-deleted/i);
      expect(knex.transaction).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/admin/facilities/:id/hard', () => {
    it('should return 403 for facility_admin', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/facilities/fac-1/hard')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);
      expectForbidden(response);
    });

    it('should hard-delete facility for dev_admin', async () => {
      const knex = createAdminTxnKnex({
        unitIds: ['unit-1'],
        gatewayIds: ['gw-1'],
        userDeviceIds: ['ud-1'],
      });
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: knex });
      const cancelSpy = jest
        .spyOn(LockCommandService.getInstance(), 'cancelPendingCommandsForFacility')
        .mockImplementation(() => undefined);

      const response = await request(app)
        .delete('/api/v1/admin/facilities/550e8400-e29b-41d4-a716-446655440001/hard')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.message).toMatch(/Facility hard-deleted/i);
      expect(cancelSpy).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001');
      cancelSpy.mockRestore();
    });
  });

  describe('POST /api/v1/admin/facilities', () => {
    it('should return 403 for admin', async () => {
      const response = await request(app)
        .post('/api/v1/admin/facilities')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ name: 'New Fac' })
        .expect(403);
      expectForbidden(response);
    });

    it('should create facility for dev_admin', async () => {
      const knex = createAdminTxnKnex();
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: knex });

      const response = await request(app)
        .post('/api/v1/admin/facilities')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ name: 'Coverage Facility', address: '1 Test Rd', status: 'active' })
        .expect(201);

      expectSuccess(response);
      expect(response.body.facility).toMatchObject({
        name: 'Coverage Facility',
        address: '1 Test Rd',
        status: 'active',
      });
      expect(response.body.facility.id).toBeTruthy();
    });
  });

  describe('POST /api/v1/admin/dev-tools/gateway-command', () => {
    const facilityId = '550e8400-e29b-41d4-a716-446655440001';
    let unicastSpy: jest.SpyInstance;
    let signJwtSpy: jest.SpyInstance;
    let resolveDeviceSpy: jest.SpyInstance;

    beforeEach(() => {
      unicastSpy = jest
        .spyOn(GatewayEventsService.getInstance(), 'unicastToFacility')
        .mockImplementation(() => undefined);
      signJwtSpy = jest.spyOn(Ed25519Service, 'signCommandJwt').mockResolvedValue('hdr.payload.sig');
      resolveDeviceSpy = jest
        .spyOn(GatewayService.getInstance(), 'resolveDeviceIdForLockCommandJwt')
        .mockResolvedValue('DEVICE-SN');
      jest.spyOn(DenylistService, 'buildDenylistAdd').mockResolvedValue(
        'hdr.' +
          Buffer.from(
            JSON.stringify({
              cmd_type: 'DENYLIST_ADD',
              iat: 1,
              exp: 2,
              denylist_add: [{ sub: 'user-1', exp: 999 }],
              target: ['DEVICE-SN'],
            }),
          ).toString('base64url') +
          '.sig',
      );
      jest.spyOn(DenylistService, 'buildDenylistRemove').mockResolvedValue(
        'hdr.' +
          Buffer.from(
            JSON.stringify({
              cmd_type: 'DENYLIST_REMOVE',
              iat: 1,
              exp: 2,
              denylist_remove: [{ sub: 'user-1', exp: 0 }],
              target: ['DEVICE-SN'],
            }),
          ).toString('base64url') +
          '.sig',
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return 400 when body is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-command')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ facilityId })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for facility_admin', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-command')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          facilityId,
          command: 'LOCK',
          targetDeviceIds: ['device-1'],
        })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 in production', async () => {
      const prev = config.nodeEnv;
      (config as { nodeEnv: string }).nodeEnv = 'production';
      try {
        const response = await request(app)
          .post('/api/v1/admin/dev-tools/gateway-command')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send({ facilityId, command: 'LOCK', targetDeviceIds: ['device-1'] })
          .expect(403);
        expect(response.body.message).toMatch(/production/i);
      } finally {
        (config as { nodeEnv: string }).nodeEnv = prev;
      }
    });

    it('should send LOCK command', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-command')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ facilityId, command: 'LOCK', targetDeviceIds: ['device-1'] })
        .expect(200);

      expectSuccess(response);
      expect(response.body.command).toBe('LOCK');
      expect(resolveDeviceSpy).toHaveBeenCalled();
      expect(signJwtSpy).toHaveBeenCalled();
      expect(unicastSpy).toHaveBeenCalled();
    });

    it('should send UNLOCK command', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-command')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ facilityId, command: 'UNLOCK', targetDeviceIds: ['device-1'] })
        .expect(200);

      expectSuccess(response);
      expect(response.body.command).toBe('UNLOCK');
    });

    it('should send DENYLIST_ADD command', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-command')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          facilityId,
          command: 'DENYLIST_ADD',
          targetDeviceIds: ['device-1'],
          userId: 'user-1',
          expirationSeconds: 3600,
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body.command).toBe('DENYLIST_ADD');
      expect(response.body.jwt).toBeTruthy();
    });

    it('should send DENYLIST_REMOVE command', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-command')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          facilityId,
          command: 'DENYLIST_REMOVE',
          targetDeviceIds: ['device-1'],
          userId: 'user-1',
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body.command).toBe('DENYLIST_REMOVE');
    });

    it('should return 500 when command signing fails', async () => {
      signJwtSpy.mockRejectedValueOnce(new Error('sign failed'));

      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-command')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ facilityId, command: 'LOCK', targetDeviceIds: ['device-1'] })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/sign failed/i);
    });
  });

  describe('POST /api/v1/admin/ops-key-rotation/broadcast legacy + managed', () => {
    it('should accept legacy payload+signature', async () => {
      const knex: any = jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1),
      }));
      knex.fn = { now: () => new Date() };
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: knex });
      const broadcastSpy = jest
        .spyOn(GatewayEventsService.getInstance(), 'broadcast')
        .mockImplementation(() => undefined);

      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          payload: {
            cmd_type: 'ROTATE_OPERATIONS_KEY',
            new_ops_pubkey: 'QUFB',
            ts: Math.floor(Date.now() / 1000) + 10,
          },
          signature: 'sig',
        })
        .expect(200);

      expectSuccess(response);
      expect(broadcastSpy).toHaveBeenCalled();
      broadcastSpy.mockRestore();
    });

    it('should return 400 for invalid legacy packet', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          payload: { cmd_type: 'WRONG', new_ops_pubkey: 'x', ts: 1 },
          signature: 'sig',
        })
        .expect(400);

      expect(response.body.message).toMatch(/Invalid rotation packet/i);
    });

    it('should return 409 when legacy ts is not monotonic', async () => {
      const knex: any = jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ value: '9999999999' }),
        insert: jest.fn(),
        update: jest.fn(),
      }));
      knex.fn = { now: () => new Date() };
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: knex });

      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          payload: {
            cmd_type: 'ROTATE_OPERATIONS_KEY',
            new_ops_pubkey: 'QUFB',
            ts: 1,
          },
          signature: 'sig',
        })
        .expect(409);

      expect(response.body.message).toMatch(/greater than last recorded/i);
    });

    it('should return 400 for invalid root private key in managed flow', async () => {
      jest.spyOn(Ed25519Service, 'signPayloadWithRootKey').mockRejectedValueOnce(new Error('bad key'));

      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ root_private_key_b64: 'not-a-valid-key!!!' })
        .expect(400);

      expect(response.body.message).toMatch(/Invalid root private key/i);
      jest.restoreAllMocks();
    });
  });

  describe('POST /api/v1/admin/data-prune (requireAdmin)', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .send({})
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 403 for tenant token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for facility_admin token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 200 for admin token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({})
        .expect(200);

      expectSuccess(response);
      expect(response.body.message).toContain('pruning');
    });

    it('should return 500 when prune throws', async () => {
      const { DataPruningService } = await import('@/services/data-pruning.service');
      const spy = jest
        .spyOn(DataPruningService.getInstance(), 'prune')
        .mockRejectedValueOnce(new Error('prune boom'));

      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/Failed to prune data/i);
      spy.mockRestore();
    });
  });

  describe('POST /api/v1/admin/route-pass-prune', () => {
    it('should return 403 for tenant', async () => {
      const response = await request(app)
        .post('/api/v1/admin/route-pass-prune')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 200 for admin', async () => {
      const response = await request(app)
        .post('/api/v1/admin/route-pass-prune')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({})
        .expect(200);

      expectSuccess(response);
    });

    it('should return 500 when route pass prune throws', async () => {
      const { RoutePassPruningService } = await import('@/services/route-pass-pruning.service');
      const spy = jest
        .spyOn(RoutePassPruningService.getInstance(), 'prune')
        .mockRejectedValueOnce(new Error('rp boom'));

      const response = await request(app)
        .post('/api/v1/admin/route-pass-prune')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
      spy.mockRestore();
    });
  });
});
