import crypto from 'crypto';
import {
  clearProvisioningStorageCache,
  getProvisioningStorageProvider,
  validateProvisioningFilename,
  validateProvisioningFileSize,
} from '@/services/provisioning/provisioning-storage.factory';
import { PROVISIONING_MAX_SIZE_BYTES } from '@/constants/provisioning.constants';
import { StorageProviderType } from '@/services/storage';

const mockBaseStorage = {
  type: StorageProviderType.LOCAL,
  initialize: jest.fn().mockResolvedValue(undefined),
  fileExists: jest.fn().mockResolvedValue(true),
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('zip-bytes')),
  uploadFile: jest.fn().mockResolvedValue(undefined),
  deleteFile: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/services/firmware/firmware-storage.factory', () => ({
  getFirmwareStorageProvider: jest.fn().mockResolvedValue({
    initialize: jest.fn(),
  }),
}));

jest.mock('@/services/storage', () => {
  const actual = jest.requireActual('@/services/storage');
  return {
    ...actual,
    createBaseStorageProvider: jest.fn(() => mockBaseStorage),
  };
});

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      })),
    })),
  },
}));

describe('provisioning-storage.factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearProvisioningStorageCache();
    mockBaseStorage.type = StorageProviderType.LOCAL;
  });

  describe('validateProvisioningFilename', () => {
    it('accepts .zip filenames', () => {
      expect(validateProvisioningFilename('mesh-backup.zip')).toEqual([]);
    });

    it('rejects non-zip and empty names', () => {
      expect(validateProvisioningFilename('backup.tar')).toContain('File must have a .zip extension');
      expect(validateProvisioningFilename('')).toContain('Invalid filename');
    });
  });

  describe('validateProvisioningFileSize', () => {
    it('rejects empty and oversized files', () => {
      expect(validateProvisioningFileSize(0)).toContain('File is empty');
      expect(validateProvisioningFileSize(PROVISIONING_MAX_SIZE_BYTES + 1)).toEqual(
        expect.arrayContaining([expect.stringMatching(/500/)]),
      );
    });

    it('accepts valid size', () => {
      expect(validateProvisioningFileSize(1024)).toEqual([]);
    });
  });

  describe('getProvisioningStorageProvider adapter', () => {
    it('builds local signed upload session with token', async () => {
      const provider = await getProvisioningStorageProvider();
      const session = await provider.createSignedUploadSession('gw-1', 'backup-1', 'mesh.zip');

      expect(session.storage_path).toBe('provisioning/gw-1/backup-1/mesh.zip');
      expect(session.upload_url).toContain('/internal/gateway/provisioning/direct-upload/backup-1');
      expect(session.upload_headers['X-Provisioning-Upload-Token']).toBeDefined();
      expect(provider.supportsSignedUpload()).toBe(true);
    });

    it('hashes downloaded files for non-GCS storage', async () => {
      const provider = await getProvisioningStorageProvider();
      const hash = await provider.hashStoredFile('provisioning/gw-1/backup-1/mesh.zip');
      const expected = crypto.createHash('sha256').update(Buffer.from('zip-bytes')).digest('hex');
      expect(hash).toBe(expected);
    });

    it('rejects invalid storage paths', async () => {
      const provider = await getProvisioningStorageProvider();
      await expect(provider.download('firmware/not-provisioning.zip')).rejects.toThrow(
        /provisioning storage/,
      );
      await expect(provider.download('provisioning/../escape.zip')).rejects.toThrow(/traversal/);
    });

    it('swallows remove errors', async () => {
      mockBaseStorage.deleteFile.mockRejectedValueOnce(new Error('delete failed'));
      const provider = await getProvisioningStorageProvider();
      await expect(provider.remove('provisioning/gw-1/x.zip')).resolves.toBeUndefined();
    });

    it('throws when signed upload unsupported provider type', async () => {
      mockBaseStorage.type = StorageProviderType.GDRIVE;
      clearProvisioningStorageCache();
      const provider = await getProvisioningStorageProvider();
      await expect(
        provider.createSignedUploadSession('gw-1', 'backup-1', 'mesh.zip'),
      ).rejects.toThrow(/Signed upload is not supported/);
    });
  });
});
