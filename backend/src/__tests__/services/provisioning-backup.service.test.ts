import { ProvisioningBackupService } from '@/services/provisioning/provisioning-backup.service';
import { PROVISIONING_MAX_SIZE_BYTES } from '@/constants/provisioning.constants';

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: jest.fn().mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' }),
    findById: jest.fn().mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' }),
  })),
}));

const mockStorage = {
  initialize: jest.fn().mockResolvedValue(undefined),
  supportsSignedUpload: jest.fn().mockReturnValue(true),
  createSignedUploadSession: jest.fn().mockImplementation((_gw, backupId, filename) => ({
    upload_id: backupId,
    storage_path: `provisioning/gw-1/${backupId}/${filename}`,
    upload_url: 'https://storage.example/upload',
    upload_headers: { 'Content-Type': 'application/zip' },
    expires_in_seconds: 3600,
  })),
  fileExists: jest.fn().mockResolvedValue(true),
  getStoredFileSize: jest.fn().mockResolvedValue(1024),
  hashStoredFile: jest.fn().mockResolvedValue('a'.repeat(64)),
  remove: jest.fn().mockResolvedValue(undefined),
  writePreparedUpload: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/services/provisioning/provisioning-storage.factory', () => {
  const actual = jest.requireActual('@/services/provisioning/provisioning-storage.factory');
  return {
    getProvisioningStorageProvider: jest.fn().mockImplementation(async () => mockStorage),
    validateProvisioningFilename: actual.validateProvisioningFilename,
    validateProvisioningFileSize: actual.validateProvisioningFileSize,
  };
});

jest.mock('@/models/gateway-provisioning-backup.model', () => {
  const baseRow = {
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
  };
  return {
    GatewayProvisioningBackupModel: jest.fn().mockImplementation(() => ({
      create: jest.fn().mockImplementation(async (data) => ({ ...baseRow, id: data.id, storage_path: data.storage_path })),
      findById: jest.fn().mockImplementation(async (id) => ({ ...baseRow, id })),
      findByGatewayId: jest.fn().mockResolvedValue([]),
      countByGatewayId: jest.fn().mockResolvedValue(0),
      deleteById: jest.fn().mockResolvedValue(true),
    })),
    sanitizeProvisioningBackup: jest.requireActual('@/models/gateway-provisioning-backup.model').sanitizeProvisioningBackup,
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
});
