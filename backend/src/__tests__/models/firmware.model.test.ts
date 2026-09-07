/**
 * FirmwareModel Unit Tests
 */

import { FirmwareModel, FirmwareImage } from '@/models/firmware.model';

// Mock uuid
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-firmware-id') }));

const mockFirmwareRow = {
  id: 'fw-1',
  version: '2.0.0',
  target_type: 'gateway',
  filename: 'firmware-2.0.0.bin',
  sha256_hash: 'abc123def456',
  size_bytes: 512000,
  description: 'Test firmware',
  release_notes: 'Bug fixes',
  compatible_models: JSON.stringify(['BLK-100', 'BLK-200']),
  minimum_version: '1.0.0',
  storage_path: '/storage/firmware/fw-1/firmware-2.0.0.bin',
  uploaded_by: 'user-1',
  is_active: 1,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
};

describe('FirmwareModel', () => {
  let model: FirmwareModel;
  let mockKnex: jest.Mock;
  let mockBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new FirmwareModel();

    mockBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };

    mockKnex = jest.fn(() => mockBuilder);
    (model as any).db = { connection: mockKnex };
  });

  describe('findAll', () => {
    it('should return all active firmware ordered by created_at desc', async () => {
      // findAll chains: select('*').orderBy('created_at','desc') then optionally .where('is_active', true)
      // The orderBy returns 'this' (chainable), then where is called, then the query resolves.
      mockBuilder.where.mockResolvedValue([mockFirmwareRow]);
      const result = await model.findAll();
      expect(mockKnex).toHaveBeenCalledWith('firmware_images');
      expect(mockBuilder.select).toHaveBeenCalledWith('*');
      expect(mockBuilder.where).toHaveBeenCalledWith('is_active', true);
    });

    it('should return all firmware when activeOnly is false', async () => {
      // When activeOnly=false, findAll resolves the query directly from orderBy (no .where)
      mockBuilder.orderBy.mockResolvedValue([mockFirmwareRow]);
      const result = await model.findAll(false);
      // where should not be called in this path
    });

    it('should filter by target_type when provided', async () => {
      // When chaining two .where() calls, the second one is awaited.
      // Use mockReturnThis for chaining, then resolve via .then on the builder.
      mockBuilder.where.mockReturnThis();
      mockBuilder.then = jest.fn((resolve: any) => resolve([mockFirmwareRow]));
      await model.findAll(true, 'lock');
      expect(mockBuilder.where).toHaveBeenCalledWith('is_active', true);
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'lock');
    });

    it('should deserialize compatible_models from JSON', async () => {
      mockBuilder.where.mockResolvedValue([mockFirmwareRow]);
      const result = await model.findAll();
      expect(result[0].compatible_models).toEqual(['BLK-100', 'BLK-200']);
    });
  });

  describe('findById', () => {
    it('should return firmware by id', async () => {
      mockBuilder.first.mockResolvedValue(mockFirmwareRow);
      const result = await model.findById('fw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('id', 'fw-1');
      expect(result).not.toBeNull();
      expect(result!.version).toBe('2.0.0');
    });

    it('should return null when not found', async () => {
      mockBuilder.first.mockResolvedValue(undefined);
      const result = await model.findById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('findByVersion', () => {
    it('should return firmware by version string (default target_type gateway)', async () => {
      mockBuilder.first.mockResolvedValue(mockFirmwareRow);
      const result = await model.findByVersion('2.0.0');
      expect(mockBuilder.where).toHaveBeenCalledWith('version', '2.0.0');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'gateway');
      expect(result).not.toBeNull();
    });

    it('should return firmware by version and target_type when provided', async () => {
      mockBuilder.first.mockResolvedValue({ ...mockFirmwareRow, target_type: 'lock' });
      const result = await model.findByVersion('2.0.0', 'lock');
      expect(mockBuilder.where).toHaveBeenCalledWith('version', '2.0.0');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'lock');
      expect(result).not.toBeNull();
    });

    it('should return null when version not found', async () => {
      mockBuilder.first.mockResolvedValue(undefined);
      const result = await model.findByVersion('9.9.9');
      expect(result).toBeNull();
    });

    it('version uniqueness is scoped by target_type (same version different type returns null when not in DB)', async () => {
      mockBuilder.first.mockResolvedValue(undefined);
      const result = await model.findByVersion('2.0.0', 'lock');
      expect(mockBuilder.where).toHaveBeenCalledWith('version', '2.0.0');
      expect(mockBuilder.where).toHaveBeenCalledWith('target_type', 'lock');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert a new firmware record', async () => {
      // Mock findById for the return value
      const findByIdSpy = jest.spyOn(model, 'findById').mockResolvedValue({
        ...mockFirmwareRow,
        id: 'test-firmware-id',
        target_type: 'gateway',
        compatible_models: ['BLK-100', 'BLK-200'],
        is_active: true,
      } as FirmwareImage);

      const result = await model.create({
        version: '2.0.0',
        filename: 'firmware-2.0.0.bin',
        sha256_hash: 'abc123def456',
        size_bytes: 512000,
        storage_path: '/storage/firmware/fw-1/firmware-2.0.0.bin',
        uploaded_by: 'user-1',
        compatible_models: ['BLK-100', 'BLK-200'],
      });

      expect(mockBuilder.insert).toHaveBeenCalled();
      const insertArg = mockBuilder.insert.mock.calls[0][0];
      expect(insertArg.id).toBe('test-firmware-id');
      expect(insertArg.version).toBe('2.0.0');
      expect(insertArg.compatible_models).toBe(JSON.stringify(['BLK-100', 'BLK-200']));
      expect(insertArg.is_active).toBe(true);
      expect(insertArg.target_type).toBe('gateway');
      findByIdSpy.mockRestore();
    });

    it('should insert with target_type when provided', async () => {
      const findByIdSpy = jest.spyOn(model, 'findById').mockResolvedValue({
        ...mockFirmwareRow,
        id: 'test-firmware-id',
        target_type: 'lock',
        compatible_models: ['BLK-100'],
        is_active: true,
      } as FirmwareImage);

      await model.create({
        version: '1.0.0',
        target_type: 'lock',
        filename: 'lock-fw.bin',
        sha256_hash: 'def',
        size_bytes: 100,
        storage_path: '/p',
        uploaded_by: 'user-1',
        compatible_models: ['BLK-100'],
      });

      const insertArg = mockBuilder.insert.mock.calls[0][0];
      expect(insertArg.target_type).toBe('lock');
      findByIdSpy.mockRestore();
    });
  });

  describe('softDelete', () => {
    it('should set is_active to false', async () => {
      mockBuilder.update.mockResolvedValue(1);
      const result = await model.softDelete('fw-1');
      expect(mockBuilder.where).toHaveBeenCalledWith('id', 'fw-1');
      expect(result).toBe(true);
      const updateArg = mockBuilder.update.mock.calls[0][0];
      expect(updateArg.is_active).toBe(false);
    });

    it('should return false when firmware not found', async () => {
      mockBuilder.update.mockResolvedValue(0);
      const result = await model.softDelete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('deserialize', () => {
    it('should handle compatible_models as already-parsed array', async () => {
      const rowWithArray = { ...mockFirmwareRow, compatible_models: ['BLK-100'] };
      mockBuilder.first.mockResolvedValue(rowWithArray);
      const result = await model.findById('fw-1');
      expect(result!.compatible_models).toEqual(['BLK-100']);
    });

    it('should handle null compatible_models', async () => {
      const rowNull = { ...mockFirmwareRow, compatible_models: null };
      mockBuilder.first.mockResolvedValue(rowNull);
      const result = await model.findById('fw-1');
      expect(result!.compatible_models).toBeNull();
    });

    it('should convert is_active to boolean', async () => {
      mockBuilder.first.mockResolvedValue({ ...mockFirmwareRow, is_active: 0 });
      const result = await model.findById('fw-1');
      expect(result!.is_active).toBe(false);
    });
  });
});
