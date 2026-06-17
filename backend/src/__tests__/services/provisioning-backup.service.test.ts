import { ProvisioningBackupService } from '@/services/provisioning/provisioning-backup.service';
import { PROVISIONING_MAX_SIZE_BYTES } from '@/constants/provisioning.constants';

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: jest.fn().mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' }),
    findById: jest.fn().mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' }),
  })),
}));

jest.mock('@/services/provisioning/provisioning-storage.factory', () => {
  const actual = jest.requireActual('@/services/provisioning/provisioning-storage.factory');
  const mockStorage = {
    initialize: jest.fn().mockResolvedValue(undefined),
    supportsSignedUpload: jest.fn().mockReturnValue(true),
    createSignedUploadSession: jest.fn().mockImplementation((_gw: string, backupId: string, filename: string) => ({
      upload_id: backupId,
      storage_path: `provisioning/gw-1/${backupId}/${filename}`,
      upload_url: 'https://storage.example/upload',
      upload_headers: {
        'Content-Type': 'application/zip',
        'X-Provisioning-Upload-Token': 'test-upload-token',
      },
      upload_token: 'test-upload-token',
      expires_in_seconds: 3600,
    })),
    fileExists: jest.fn().mockResolvedValue(true),
    getStoredFileSize: jest.fn().mockResolvedValue(1024),
    hashStoredFile: jest.fn().mockResolvedValue('a'.repeat(64)),
    remove: jest.fn().mockResolvedValue(undefined),
    writePreparedUpload: jest.fn().mockResolvedValue(undefined),
  };
  return {
    getProvisioningStorageProvider: jest.fn().mockResolvedValue(mockStorage),
    validateProvisioningFilename: actual.validateProvisioningFilename,
    validateProvisioningFileSize: actual.validateProvisioningFileSize,
    __mockStorage: mockStorage,
  };
});

jest.mock('@/models/gateway-provisioning-backup.model', () => {
  const mockBackupModel = {
    create: jest.fn().mockImplementation(async (data: { id: string; storage_path: string }) => ({
      gateway_id: 'gw-1',
      facility_id: 'fac-1',
      filename: 'mesh.zip',
      size_bytes: 1024,
      sha256_hash: 'a'.repeat(64),
      storage_path: data.storage_path,
      upload_source: 'gateway_push',
      created_by: null,
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      id: data.id,
    })),
    findById: jest.fn().mockImplementation(async (id: string) => ({
      id,
      gateway_id: 'gw-1',
      facility_id: 'fac-1',
      filename: 'mesh.zip',
      size_bytes: 1024,
      sha256_hash: 'a'.repeat(64),
      storage_path: 'provisioning/gw-1/backup/mesh.zip',
      upload_source: 'gateway_push',
      created_by: null,
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    })),
    findByGatewayId: jest.fn().mockResolvedValue([]),
    countByGatewayId: jest.fn().mockResolvedValue(0),
    deleteById: jest.fn().mockResolvedValue(true),
  };
  return {
    GatewayProvisioningBackupModel: jest.fn().mockImplementation(() => mockBackupModel),
    sanitizeProvisioningBackup: jest.requireActual('@/models/gateway-provisioning-backup.model').sanitizeProvisioningBackup,
    __mockBackupModel: mockBackupModel,
  };
});

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn().mockReturnValue({
      getFacilityConnectionStatus: jest.fn().mockReturnValue({ connected: true }),
      unicastToFacility: jest.fn(),
    }),
  },
}));

jest.mock('@/services/crypto/ed25519.service', () => ({
  Ed25519Service: {
    signCommandJwt: jest.fn().mockResolvedValue('signed-jwt'),
  },
}));

describe('ProvisioningBackupService', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __mockBackupModel: mockBackupModel } = require('@/models/gateway-provisioning-backup.model');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __mockStorage: mockStorage } = require('@/services/provisioning/provisioning-storage.factory');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-zip filenames on prepare', async () => {
    await expect(
      ProvisioningBackupService.prepareUpload('fac-1', 'backup.tar', 1024),
    ).rejects.toThrow(/\.zip/);
  });

  it('rejects files over 500MB on prepare', async () => {
    await expect(
      ProvisioningBackupService.prepareUpload('fac-1', 'mesh.zip', PROVISIONING_MAX_SIZE_BYTES + 1),
    ).rejects.toThrow(/500/);
  });

  it('prepare returns signed upload session', async () => {
    const session = await ProvisioningBackupService.prepareUpload('fac-1', 'mesh.zip', 1024);
    expect(session.upload_url).toBe('https://storage.example/upload');
    expect(session.gateway_id).toBe('gw-1');
    expect(mockStorage.createSignedUploadSession).toHaveBeenCalled();
  });

  it('complete creates DB row and strips storage_path', async () => {
    const session = await ProvisioningBackupService.prepareUpload('fac-1', 'mesh.zip', 1024);
    const backup = await ProvisioningBackupService.completeUpload(
      'fac-1',
      session.upload_id,
      'mesh.zip',
      1024,
    );
    expect(backup.id).toBe(session.upload_id);
    expect((backup as { storage_path?: string }).storage_path).toBeUndefined();
  });

  it('complete rejects size mismatch', async () => {
    const session = await ProvisioningBackupService.prepareUpload('fac-1', 'mesh.zip', 1024);
    mockStorage.getStoredFileSize.mockResolvedValueOnce(2048);
    await expect(
      ProvisioningBackupService.completeUpload(
        'fac-1',
        session.upload_id,
        'mesh.zip',
        1024,
      ),
    ).rejects.toThrow(/size mismatch/);
    expect(mockStorage.remove).toHaveBeenCalled();
  });

  it('delete removes storage object', async () => {
    const deleted = await ProvisioningBackupService.deleteBackup('backup-delete-id');
    expect(deleted).toBe(true);
    expect(mockStorage.remove).toHaveBeenCalled();
  });

  it('delete returns false when backup row missing', async () => {
    mockBackupModel.findById.mockResolvedValueOnce(null);

    const deleted = await ProvisioningBackupService.deleteBackup('missing-backup');
    expect(deleted).toBe(false);
    expect(mockStorage.remove).not.toHaveBeenCalled();
  });

  it('listBackups sanitizes rows and returns total', async () => {
    mockBackupModel.findByGatewayId.mockResolvedValueOnce([
      {
        id: 'b-1',
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
        filename: 'mesh.zip',
        size_bytes: 1024,
        sha256_hash: 'a'.repeat(64),
        storage_path: 'provisioning/gw-1/b-1/mesh.zip',
        upload_source: 'gateway_push',
        created_by: null,
        uploaded_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    mockBackupModel.countByGatewayId.mockResolvedValueOnce(1);

    const result = await ProvisioningBackupService.listBackups('gw-1', 10, 0);
    expect(result.total).toBe(1);
    expect(result.backups).toHaveLength(1);
    expect((result.backups[0] as { storage_path?: string }).storage_path).toBeUndefined();
  });

  it('getBackup returns null when not found', async () => {
    mockBackupModel.findById.mockResolvedValueOnce(null);
    await expect(ProvisioningBackupService.getBackup('missing')).resolves.toBeNull();
  });

  it('requestUploadFromGateway signs JWT and unicasts when gateway online', async () => {
    const { GatewayEventsService } = require('@/services/gateway/gateway-events.service');
    const { Ed25519Service } = require('@/services/crypto/ed25519.service');

    const result = await ProvisioningBackupService.requestUploadFromGateway('gw-1', 'fac-1', 'admin-1');

    expect(result.request_id).toBeDefined();
    expect(Ed25519Service.signCommandJwt).toHaveBeenCalledWith(
      expect.objectContaining({ cmd_type: 'PROVISIONING_UPLOAD_REQUEST' }),
    );
    expect(GatewayEventsService.getInstance().unicastToFacility).toHaveBeenCalled();
  });

  it('requestUploadFromGateway rejects when gateway offline', async () => {
    const { GatewayEventsService } = require('@/services/gateway/gateway-events.service');
    GatewayEventsService.getInstance().getFacilityConnectionStatus.mockReturnValueOnce({
      connected: false,
    });

    await expect(
      ProvisioningBackupService.requestUploadFromGateway('gw-1', 'fac-1', 'admin-1'),
    ).rejects.toThrow(/offline/i);
  });

  it('receiveDirectUpload writes prepared upload when token matches', async () => {
    const session = await ProvisioningBackupService.prepareUpload('fac-1', 'mesh.zip', 1024);
    const data = Buffer.alloc(1024, 1);

    await ProvisioningBackupService.receiveDirectUpload(
      session.upload_id,
      'test-upload-token',
      data,
    );

    expect(mockStorage.writePreparedUpload).toHaveBeenCalledWith(session.storage_path, data);
  });

  it('receiveDirectUpload rejects invalid token', async () => {
    const session = await ProvisioningBackupService.prepareUpload('fac-1', 'mesh.zip', 1024);
    await expect(
      ProvisioningBackupService.receiveDirectUpload(session.upload_id, 'bad-token', Buffer.alloc(1024)),
    ).rejects.toThrow(/Invalid provisioning upload token/);
  });

  it('assertUploadRateLimit throws after max requests in window', () => {
    for (let i = 0; i < 30; i += 1) {
      ProvisioningBackupService.assertUploadRateLimit('fac-rate');
    }
    expect(() => ProvisioningBackupService.assertUploadRateLimit('fac-rate')).toThrow(/Too many provisioning upload requests/);
  });
});
