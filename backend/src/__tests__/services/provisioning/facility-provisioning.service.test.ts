jest.mock('uuid', () => ({ v4: () => 'upload-1' }));

jest.mock('@/models/facility-provisioning-file.model', () => {
  const actual = jest.requireActual('@/models/facility-provisioning-file.model');
  const mockFileModel = {
    create: jest.fn(),
    findById: jest.fn(),
    findByFacilityId: jest.fn(),
    countByFacilityId: jest.fn(),
    deleteById: jest.fn(),
  };
  return {
    ...actual,
    FacilityProvisioningFileModel: jest.fn().mockImplementation(() => mockFileModel),
    __mockFileModel: mockFileModel,
  };
});

jest.mock('@/models/facility.model', () => {
  const mockFacilityModel = {
    findById: jest.fn(),
  };
  return {
    FacilityModel: jest.fn().mockImplementation(() => mockFacilityModel),
    __mockFacilityModel: mockFacilityModel,
  };
});

jest.mock('@/services/provisioning/provisioning-storage.factory', () => {
  const actual = jest.requireActual('@/services/provisioning/provisioning-storage.factory');
  const mockStorage = {
    initialize: jest.fn().mockResolvedValue(undefined),
    supportsSignedUpload: jest.fn().mockReturnValue(true),
    buildStoragePath: jest.fn(
      (facilityId: string, fileId: string, filename: string) =>
        `facility-provisioning/${facilityId}/${fileId}/${filename}`,
    ),
    createSignedUploadSession: jest.fn(),
    fileExists: jest.fn(),
    getStoredFileSize: jest.fn(),
    hashStoredFile: jest.fn(),
    download: jest.fn(),
    remove: jest.fn(),
    writePreparedUpload: jest.fn(),
  };

  return {
    ...actual,
    getProvisioningStorageProvider: jest.fn().mockResolvedValue(mockStorage),
    validateProvisioningFilename: actual.validateProvisioningFilename,
    validateProvisioningFileSize: actual.validateProvisioningFileSize,
    __mockStorage: mockStorage,
  };
});

import { FacilityProvisioningService, sanitizeContentDispositionFilename } from '@/services/provisioning/facility-provisioning.service';
import { PROVISIONING_MAX_SIZE_BYTES } from '@/constants/provisioning.constants';

const { __mockFileModel: mockFileModel } = jest.requireMock('@/models/facility-provisioning-file.model');
const { __mockFacilityModel: mockFacilityModel } = jest.requireMock('@/models/facility.model');
const { __mockStorage: mockStorage } = jest.requireMock('@/services/provisioning/provisioning-storage.factory');

describe('FacilityProvisioningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFacilityModel.findById.mockResolvedValue({ id: 'fac-1' });
    mockStorage.createSignedUploadSession.mockResolvedValue({
      upload_id: 'upload-1',
      upload_url: 'http://localhost/upload',
      upload_headers: { 'Content-Type': 'application/octet-stream' },
      upload_token: 'token-1',
      storage_path: 'facility-provisioning/fac-1/upload-1/mesh.bin',
      expires_in_seconds: 3600,
    });
    mockStorage.fileExists.mockResolvedValue(true);
    mockStorage.getStoredFileSize.mockResolvedValue(1024);
    mockStorage.hashStoredFile.mockResolvedValue('a'.repeat(64));
    mockFileModel.create.mockResolvedValue({
      id: 'upload-1',
      facility_id: 'fac-1',
      filename: 'mesh.bin',
      content_type: 'application/octet-stream',
      size_bytes: 1024,
      sha256_hash: 'a'.repeat(64),
      storage_path: 'facility-provisioning/fac-1/upload-1/mesh.bin',
      upload_source: 'dashboard',
      created_by: null,
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    mockFileModel.findById.mockResolvedValue(null);
    mockFileModel.findByFacilityId.mockResolvedValue([]);
    mockFileModel.countByFacilityId.mockResolvedValue(0);
    mockFileModel.deleteById.mockResolvedValue(true);
    mockStorage.download.mockResolvedValue(Buffer.from('file-bytes'));
  });

  it('rejects prepare when facility does not exist', async () => {
    mockFacilityModel.findById.mockResolvedValue(null);
    await expect(
      FacilityProvisioningService.prepareUpload('missing', 'mesh.bin', 1024),
    ).rejects.toThrow(/Facility not found/);
  });

  it('rejects prepare when file exceeds max size', async () => {
    await expect(
      FacilityProvisioningService.prepareUpload('fac-1', 'mesh.bin', PROVISIONING_MAX_SIZE_BYTES + 1),
    ).rejects.toThrow(/validation failed/i);
  });

  it('prepares signed upload session for valid file', async () => {
    const session = await FacilityProvisioningService.prepareUpload('fac-1', 'mesh.bin', 1024);
    expect(session.upload_id).toBe('upload-1');
    expect(session.facility_id).toBe('fac-1');
    expect(session).not.toHaveProperty('storage_path');
    expect(mockStorage.createSignedUploadSession).toHaveBeenCalledWith(
      'fac-1',
      'upload-1',
      'mesh.bin',
      'application/octet-stream',
      undefined,
    );
  });

  it('completes upload after verifying storage object', async () => {
    const session = await FacilityProvisioningService.prepareUpload('fac-1', 'mesh.bin', 1024);
    const file = await FacilityProvisioningService.completeUpload(
      'fac-1',
      session.upload_id,
      'mesh.bin',
      1024,
    );
    expect(file.id).toBe('upload-1');
    expect(file).not.toHaveProperty('storage_path');
    expect(mockFileModel.create).toHaveBeenCalled();
  });

  it('completes upload statelessly when prepare session is absent but storage object exists', async () => {
    const file = await FacilityProvisioningService.completeUpload(
      'fac-1',
      'upload-1',
      'mesh.bin',
      1024,
    );
    expect(file.id).toBe('upload-1');
    expect(mockStorage.buildStoragePath).toHaveBeenCalledWith('fac-1', 'upload-1', 'mesh.bin');
    expect(mockFileModel.create).toHaveBeenCalled();
  });

  it('rejects complete when storage object is missing', async () => {
    mockStorage.fileExists.mockResolvedValue(false);
    await expect(
      FacilityProvisioningService.completeUpload('fac-1', 'missing-id', 'mesh.bin', 1024),
    ).rejects.toThrow(/not found in storage/);
  });

  it('returns existing file when complete is called again for the same upload id', async () => {
    const existingRow = {
      id: 'upload-1',
      facility_id: 'fac-1',
      filename: 'mesh.bin',
      content_type: 'application/octet-stream',
      size_bytes: 1024,
      sha256_hash: 'a'.repeat(64),
      storage_path: 'facility-provisioning/fac-1/upload-1/mesh.bin',
      upload_source: 'dashboard' as const,
      created_by: null,
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    await FacilityProvisioningService.prepareUpload('fac-1', 'mesh.bin', 1024);
    await FacilityProvisioningService.completeUpload('fac-1', 'upload-1', 'mesh.bin', 1024);

    mockFileModel.findById.mockResolvedValue(existingRow);
    mockFileModel.create.mockClear();

    const file = await FacilityProvisioningService.completeUpload('fac-1', 'upload-1', 'mesh.bin', 1024);
    expect(file.id).toBe('upload-1');
    expect(mockFileModel.create).not.toHaveBeenCalled();
  });

  it('lists files for facility', async () => {
    mockFileModel.findByFacilityId.mockResolvedValue([
      {
        id: 'file-1',
        facility_id: 'fac-1',
        filename: 'mesh.bin',
        content_type: 'application/octet-stream',
        size_bytes: 1024,
        sha256_hash: 'a'.repeat(64),
        storage_path: 'facility-provisioning/fac-1/file-1/mesh.bin',
        upload_source: 'dashboard',
        created_by: null,
        uploaded_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    mockFileModel.countByFacilityId.mockResolvedValue(1);

    const result = await FacilityProvisioningService.listFiles('fac-1');
    expect(result.total).toBe(1);
    expect(result.files[0]).not.toHaveProperty('storage_path');
  });

  it('streams download for facility file', async () => {
    mockFileModel.findById.mockResolvedValue({
      id: 'upload-1',
      facility_id: 'fac-1',
      filename: 'mesh.bin',
      content_type: 'application/octet-stream',
      size_bytes: 1024,
      sha256_hash: 'a'.repeat(64),
      storage_path: 'facility-provisioning/fac-1/upload-1/mesh.bin',
      upload_source: 'dashboard',
      created_by: null,
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const result = await FacilityProvisioningService.streamDownload('upload-1', 'fac-1');
    expect(result.buffer.toString()).toBe('file-bytes');
    expect(result.filename).toBe('mesh.bin');
  });

  it('deletes file and storage object', async () => {
    mockFileModel.findById.mockResolvedValue({
      id: 'upload-1',
      facility_id: 'fac-1',
      filename: 'mesh.bin',
      content_type: 'application/octet-stream',
      size_bytes: 1024,
      sha256_hash: 'a'.repeat(64),
      storage_path: 'facility-provisioning/fac-1/upload-1/mesh.bin',
      upload_source: 'dashboard',
      created_by: null,
      uploaded_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const deleted = await FacilityProvisioningService.deleteFile('upload-1');
    expect(deleted).toBe(true);
    expect(mockStorage.remove).toHaveBeenCalled();
  });

  it('accepts direct upload with valid token', async () => {
    const session = await FacilityProvisioningService.prepareUpload('fac-1', 'mesh.bin', 1024);
    await FacilityProvisioningService.receiveDirectUpload(
      'fac-1',
      session.upload_id,
      'token-1',
      Buffer.alloc(1024),
    );
    expect(mockStorage.writePreparedUpload).toHaveBeenCalled();
  });

  it('rejects direct upload with invalid token', async () => {
    const session = await FacilityProvisioningService.prepareUpload('fac-1', 'mesh.bin', 1024);
    await expect(
      FacilityProvisioningService.receiveDirectUpload(
        'fac-1',
        session.upload_id,
        'bad-token',
        Buffer.alloc(1024),
      ),
    ).rejects.toThrow(/Invalid provisioning upload token/);
  });

  it('enforces upload rate limit per facility', () => {
    for (let i = 0; i < 30; i += 1) {
      FacilityProvisioningService.assertUploadRateLimit('fac-rate');
    }
    expect(() => FacilityProvisioningService.assertUploadRateLimit('fac-rate')).toThrow(
      /Too many provisioning upload requests/,
    );
  });
});

describe('sanitizeContentDispositionFilename', () => {
  it('strips quotes, backslashes, and newlines', () => {
    expect(sanitizeContentDispositionFilename('mesh\r\n"bad".bin')).toBe('meshbad.bin');
  });

  it('falls back to download for empty result', () => {
    expect(sanitizeContentDispositionFilename('   ')).toBe('download');
  });
});
