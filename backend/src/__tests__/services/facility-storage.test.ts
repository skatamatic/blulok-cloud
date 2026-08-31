/**
 * FacilityStorageAdapter Unit Tests
 */

import { FacilityStorageAdapter, clearFacilityStorageCache } from '@/bludesign/services/facility-storage.adapter';
import { BaseStorageProvider, StorageProviderType } from '@/services/storage/base-storage.interface';
import { FacilityData } from '@/bludesign/services/facility.service';

function makeMockBaseProvider(): jest.Mocked<BaseStorageProvider> {
  return {
    type: StorageProviderType.GCS,
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
    uploadFile: jest.fn().mockResolvedValue('path'),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('{}')),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    fileExists: jest.fn().mockResolvedValue(false),
    listFiles: jest.fn().mockResolvedValue([]),
    deleteDirectory: jest.fn().mockResolvedValue(undefined),
    getDirectorySize: jest.fn().mockResolvedValue(0),
  };
}

const sampleData: FacilityData = {
  name: 'Test Facility',
  version: '1.0.0',
  camera: { mode: 'isometric', position: { x: 0, y: 5, z: 0 } },
  placedObjects: [{ id: 'obj-1', assetId: 'asset-1', position: { x: 0, z: 0 } }],
  gridSize: 10,
  showGrid: true,
};

describe('FacilityStorageAdapter', () => {
  let mockBase: jest.Mocked<BaseStorageProvider>;
  let adapter: FacilityStorageAdapter;

  beforeEach(() => {
    clearFacilityStorageCache();
    mockBase = makeMockBaseProvider();
    adapter = new FacilityStorageAdapter(mockBase);
  });

  describe('saveData', () => {
    it('should upload JSON to correct path', async () => {
      await adapter.saveData('user-1', 'fac-1', sampleData);

      expect(mockBase.uploadFile).toHaveBeenCalledTimes(1);
      const [path, buffer, contentType] = mockBase.uploadFile.mock.calls[0];
      expect(path).toBe('bludesign/user-facilities/user-1/fac-1/data.json');
      expect(contentType).toBe('application/json');
      const parsed = JSON.parse(buffer.toString('utf-8'));
      expect(parsed.name).toBe('Test Facility');
      expect(parsed.placedObjects).toHaveLength(1);
    });

    it('should reject userId with path traversal', async () => {
      await expect(adapter.saveData('../evil', 'fac-1', sampleData)).rejects.toThrow('path traversal');
    });

    it('should reject facilityId with slashes', async () => {
      await expect(adapter.saveData('user-1', 'fac/../../etc', sampleData)).rejects.toThrow('path traversal');
    });
  });

  describe('loadData', () => {
    it('should download and parse JSON from correct path', async () => {
      mockBase.downloadFile.mockResolvedValue(Buffer.from(JSON.stringify(sampleData)));

      const result = await adapter.loadData('user-1', 'fac-1');

      expect(mockBase.downloadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-1/data.json',
      );
      expect(result.name).toBe('Test Facility');
      expect(result.gridSize).toBe(10);
    });

    it('should propagate storage errors', async () => {
      mockBase.downloadFile.mockRejectedValue(new Error('NOT_FOUND'));
      await expect(adapter.loadData('user-1', 'missing')).rejects.toThrow('NOT_FOUND');
    });
  });

  describe('deleteData', () => {
    it('should delete the facility directory', async () => {
      await adapter.deleteData('user-1', 'fac-1');

      expect(mockBase.deleteDirectory).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-1',
      );
    });

    it('should not throw when delete fails', async () => {
      mockBase.deleteDirectory.mockRejectedValue(new Error('boom'));
      await expect(adapter.deleteData('user-1', 'fac-1')).resolves.not.toThrow();
    });
  });

  describe('layout source', () => {
    it('should upload PNG to layout-source path', async () => {
      const png = Buffer.from('fake-png');

      await adapter.saveLayoutSource('user-1', 'fac-1', png);

      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-1/layout-source.png',
        png,
        'image/png',
      );
    });

    it('should download layout source from correct path', async () => {
      const png = Buffer.from('fake-png');
      mockBase.downloadFile.mockResolvedValue(png);

      const result = await adapter.loadLayoutSource('user-1', 'fac-1');

      expect(mockBase.downloadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-1/layout-source.png',
      );
      expect(result).toEqual(png);
    });

    it('should reject path traversal in layout source paths', async () => {
      await expect(adapter.saveLayoutSource('../evil', 'fac-1', Buffer.from('x'))).rejects.toThrow(
        'path traversal',
      );
    });

    it('should copy layout source between facility folders', async () => {
      const png = Buffer.from('fake-png');
      mockBase.downloadFile.mockResolvedValue(png);

      await adapter.copyLayoutSource('user-1', 'fac-source', 'fac-target');

      expect(mockBase.downloadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-source/layout-source.png',
      );
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-target/layout-source.png',
        png,
        'image/png',
      );
    });
  });

  describe('terrain sidecars', () => {
    it('should upload JPEG imagery to terrain-imagery path', async () => {
      const jpg = Buffer.from('fake-jpg');
      await adapter.saveTerrainImagery('user-1', 'fac-1', jpg);
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-1/terrain-imagery.jpg',
        jpg,
        'image/jpeg',
      );
    });

    it('should upload PNG heightmap to terrain-heightmap path', async () => {
      const png = Buffer.from('fake-png');
      await adapter.saveTerrainHeightmap('user-1', 'fac-1', png);
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-1/terrain-heightmap.png',
        png,
        'image/png',
      );
    });

    it('should upload terrain-data imagery by terrainDataId', async () => {
      const jpg = Buffer.from('fake-jpg');
      await adapter.saveTerrainDataImagery('user-1', 'terrain-1', jpg);
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/terrain-data/user-1/terrain-1/imagery.jpg',
        jpg,
        'image/jpeg',
      );
    });

    it('should upload terrain-data heightmap by terrainDataId', async () => {
      const png = Buffer.from('fake-png');
      await adapter.saveTerrainDataHeightmap('user-1', 'terrain-1', png);
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/terrain-data/user-1/terrain-1/heightmap.png',
        png,
        'image/png',
      );
    });

    it('should delete terrain-data sidecars by terrainDataId', async () => {
      await adapter.deleteTerrainData('user-1', 'terrain-1');
      expect(mockBase.deleteFile).toHaveBeenCalledWith(
        'bludesign/terrain-data/user-1/terrain-1/imagery.jpg',
      );
      expect(mockBase.deleteFile).toHaveBeenCalledWith(
        'bludesign/terrain-data/user-1/terrain-1/heightmap.png',
      );
    });

    it('should copy terrain assets between facility folders', async () => {
      const jpg = Buffer.from('imagery');
      const png = Buffer.from('heightmap');
      mockBase.downloadFile
        .mockResolvedValueOnce(jpg)
        .mockResolvedValueOnce(png);

      await adapter.copyTerrainAssets('user-1', 'fac-source', 'fac-target');

      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-target/terrain-imagery.jpg',
        jpg,
        'image/jpeg',
      );
      expect(mockBase.uploadFile).toHaveBeenCalledWith(
        'bludesign/user-facilities/user-1/fac-target/terrain-heightmap.png',
        png,
        'image/png',
      );
    });
  });
});
