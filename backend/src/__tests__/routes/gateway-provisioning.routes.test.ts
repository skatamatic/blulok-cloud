import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectForbidden, expectUnauthorized } from '@/__tests__/utils/mock-test-helpers';

jest.mock('@/services/provisioning/provisioning-backup.service', () => ({
  ProvisioningBackupService: {
    listBackups: jest.fn().mockResolvedValue({
      backups: [{
        id: 'backup-1',
        gateway_id: 'gateway-1',
        facility_id: 'facility-1',
        filename: 'mesh.zip',
        size_bytes: 1024,
        sha256_hash: 'a'.repeat(64),
        upload_source: 'gateway_push',
        created_by: null,
        uploaded_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }],
      total: 1,
    }),
    getBackup: jest.fn().mockResolvedValue({
      id: 'backup-1',
      gateway_id: 'gateway-1',
      facility_id: 'facility-1',
      filename: 'mesh.zip',
    }),
    deleteBackup: jest.fn().mockResolvedValue(true),
    requestUploadFromGateway: jest.fn().mockResolvedValue({ request_id: 'req-1', expires_at: 1234567890 }),
  },
}));

jest.mock('@/services/provisioning/provisioning-restore.service', () => ({
  ProvisioningRestoreService: {
    getRestoreStatus: jest.fn().mockResolvedValue({ active: null, history: [] }),
    initiateRestore: jest.fn().mockResolvedValue({ id: 'restore-1', status: 'pending' }),
    getRestoreById: jest.fn().mockResolvedValue({ id: 'restore-1', gateway_id: 'gateway-1', status: 'transferring' }),
    cancelRestore: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'gateway-1') return { id: 'gateway-1', facility_id: 'facility-1' };
      if (id === 'gateway-2') return { id: 'gateway-2', facility_id: 'facility-2' };
      return null;
    }),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findReassignmentCandidates: jest.fn().mockResolvedValue([]),
  })),
}));

describe('Gateway Provisioning Routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: ReturnType<typeof createMockTestData>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
  });

  it('requires auth for provisioning list', async () => {
    const res = await request(app).get('/api/v1/gateways/gateway-1/provisioning');
    expectUnauthorized(res);
  });

  it('allows facility admin to list backups', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-1/provisioning')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.backups).toHaveLength(1);
  });

  it('denies facility admin delete (platform admin only)', async () => {
    const res = await request(app)
      .delete('/api/v1/gateways/gateway-1/provisioning/backup-1')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

    expectForbidden(res);
  });

  it('allows admin to delete backup', async () => {
    const res = await request(app)
      .delete('/api/v1/gateways/gateway-1/provisioning/backup-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBe(true);
  });

  it('allows facility admin to request upload', async () => {
    const res = await request(app)
      .post('/api/v1/gateways/gateway-1/provisioning/request-upload')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.data.request_id).toBe('req-1');
  });

  it('denies facility admin access to other facility gateway', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-2/provisioning')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

    expectForbidden(res);
  });

  it('allows facility admin to initiate restore', async () => {
    const { ProvisioningRestoreService } = require('@/services/provisioning/provisioning-restore.service');
    const res = await request(app)
      .post('/api/v1/gateways/gateway-1/provisioning/backup-1/restore')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.data.id).toBe('restore-1');
    expect(ProvisioningRestoreService.initiateRestore).toHaveBeenCalled();
  });

  it('allows facility admin to cancel restore', async () => {
    const { ProvisioningRestoreService } = require('@/services/provisioning/provisioning-restore.service');
    const res = await request(app)
      .post('/api/v1/gateways/gateway-1/provisioning/restore/restore-1/cancel')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(ProvisioningRestoreService.cancelRestore).toHaveBeenCalledWith('restore-1');
  });
});
