import { AssetService, LockerSpec } from '../../bludesign/services/asset.service';
import { DatabaseService } from '../../services/database.service';
import { AssetCategory } from '../../bludesign/types/bludesign.types';

// Mock DatabaseService
jest.mock('../../services/database.service');

describe('AssetService - LockerSpec Support', () => {
  let mockDb: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock database
    mockDb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
    };
    
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: jest.fn(() => mockDb),
    });
  });

  describe('createAssetDefinition with lockerSpec', () => {
    it('should create asset with locker spec', async () => {
      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 0.9144, // 3 ft
        doorHeight: 1.8288, // 6 ft
        doorPositionX: 0,
        doorPositionY: 0.1524, // 0.5 ft
      };

      const input = {
        name: 'Custom 5x8x5 Locker',
        category: AssetCategory.STORAGE_UNIT,
        modelType: 'primitive' as const,
        dimensions: { width: 1.524, height: 2.4384, depth: 1.524 }, // 5x8x5 ft
        gridUnits: { x: 3, z: 3 },
        isSmart: true,
        canRotate: true,
        canStack: false,
        lockerSpec,
      };

      // Mock the insert and subsequent select
      mockDb.insert.mockResolvedValue([1]);
      mockDb.first.mockResolvedValue({
        id: 'asset-123',
        name: input.name,
        category: input.category,
        model_type: input.modelType,
        dimensions: JSON.stringify(input.dimensions),
        grid_units: JSON.stringify(input.gridUnits),
        is_smart: input.isSmart,
        can_rotate: input.canRotate,
        can_stack: input.canStack,
        locker_spec: JSON.stringify(lockerSpec),
        is_builtin: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await AssetService.createAssetDefinition(input);

      expect(mockDb.insert).toHaveBeenCalled();
      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.locker_spec).toBe(JSON.stringify(lockerSpec));
      expect(result.lockerSpec).toEqual(lockerSpec);
    });

    it('should create asset without locker spec for non-locker assets', async () => {
      const input = {
        name: 'Entry Gate',
        category: AssetCategory.GATE,
        modelType: 'primitive' as const,
        dimensions: { width: 3.6576, height: 2.4384, depth: 0.3048 },
        gridUnits: { x: 6, z: 1 },
        isSmart: true,
        canRotate: true,
        canStack: false,
      };

      mockDb.insert.mockResolvedValue([1]);
      mockDb.first.mockResolvedValue({
        id: 'asset-456',
        name: input.name,
        category: input.category,
        model_type: input.modelType,
        dimensions: JSON.stringify(input.dimensions),
        grid_units: JSON.stringify(input.gridUnits),
        is_smart: input.isSmart,
        can_rotate: input.canRotate,
        can_stack: input.canStack,
        locker_spec: null,
        is_builtin: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await AssetService.createAssetDefinition(input);

      expect(mockDb.insert).toHaveBeenCalled();
      const insertCall = mockDb.insert.mock.calls[0][0];
      expect(insertCall.locker_spec).toBeNull();
      expect(result.lockerSpec).toBeUndefined();
    });
  });

  describe('updateAssetDefinition with lockerSpec', () => {
    it('should update locker spec', async () => {
      const assetId = 'asset-123';
      const updatedLockerSpec: LockerSpec = {
        doorSide: 'right',
        doorWidth: 1.2192, // 4 ft
        doorHeight: 2.1336, // 7 ft
        doorPositionX: 0.3048, // 1 ft offset
        doorPositionY: 0.3048,
      };

      mockDb.update.mockResolvedValue([1]);
      mockDb.first.mockResolvedValue({
        id: assetId,
        name: 'Updated Locker',
        category: AssetCategory.STORAGE_UNIT,
        model_type: 'primitive',
        dimensions: JSON.stringify({ width: 2, height: 3, depth: 2 }),
        grid_units: JSON.stringify({ x: 4, z: 4 }),
        is_smart: true,
        can_rotate: true,
        can_stack: false,
        locker_spec: JSON.stringify(updatedLockerSpec),
        is_builtin: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await AssetService.updateAssetDefinition(assetId, {
        lockerSpec: updatedLockerSpec,
      });

      expect(mockDb.update).toHaveBeenCalled();
      const updateCall = mockDb.update.mock.calls[0][0];
      expect(updateCall.locker_spec).toBe(JSON.stringify(updatedLockerSpec));
      expect(result?.lockerSpec).toEqual(updatedLockerSpec);
    });
  });

  describe('getAssetDefinition with lockerSpec', () => {
    it('should retrieve asset with locker spec', async () => {
      const lockerSpec: LockerSpec = {
        doorSide: 'back',
        doorWidth: 1.524,
        doorHeight: 2.1336,
        doorPositionX: -0.1524,
        doorPositionY: 0.3048,
      };

      mockDb.first.mockResolvedValue({
        id: 'asset-789',
        name: 'Test Locker',
        category: AssetCategory.STORAGE_UNIT,
        model_type: 'primitive',
        dimensions: JSON.stringify({ width: 1.5, height: 2.5, depth: 1.5 }),
        grid_units: JSON.stringify({ x: 3, z: 3 }),
        is_smart: true,
        can_rotate: true,
        can_stack: false,
        locker_spec: JSON.stringify(lockerSpec),
        is_builtin: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await AssetService.getAssetDefinition('asset-789');

      expect(result).not.toBeNull();
      expect(result?.lockerSpec).toEqual(lockerSpec);
      expect(result?.lockerSpec?.doorSide).toBe('back');
      expect(result?.lockerSpec?.doorPositionX).toBe(-0.1524);
    });

    it('should handle null locker spec gracefully', async () => {
      mockDb.first.mockResolvedValue({
        id: 'asset-999',
        name: 'Non-Locker Asset',
        category: AssetCategory.ELEVATOR,
        model_type: 'primitive',
        dimensions: JSON.stringify({ width: 3, height: 3.5, depth: 3.5 }),
        grid_units: JSON.stringify({ x: 5, z: 6 }),
        is_smart: true,
        can_rotate: true,
        can_stack: false,
        locker_spec: null,
        is_builtin: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await AssetService.getAssetDefinition('asset-999');

      expect(result).not.toBeNull();
      expect(result?.lockerSpec).toBeUndefined();
    });
  });

  describe('LockerSpec validation', () => {
    it('should handle all valid door sides', async () => {
      const doorSides: Array<LockerSpec['doorSide']> = ['front', 'back', 'left', 'right'];

      for (const doorSide of doorSides) {
        const lockerSpec: LockerSpec = {
          doorSide,
          doorWidth: 1.0,
          doorHeight: 2.0,
          doorPositionX: 0,
          doorPositionY: 0.5,
        };

        const input = {
          name: `Locker with ${doorSide} door`,
          category: AssetCategory.STORAGE_UNIT,
          modelType: 'primitive' as const,
          dimensions: { width: 1.5, height: 2.5, depth: 1.5 },
          gridUnits: { x: 3, z: 3 },
          lockerSpec,
        };

        mockDb.insert.mockResolvedValue([1]);
        mockDb.first.mockResolvedValue({
          id: `asset-${doorSide}`,
          ...input,
          dimensions: JSON.stringify(input.dimensions),
          grid_units: JSON.stringify(input.gridUnits),
          locker_spec: JSON.stringify(lockerSpec),
          is_builtin: false,
          is_smart: false,
          can_rotate: true,
          can_stack: false,
          created_at: new Date(),
          updated_at: new Date(),
        });

        const result = await AssetService.createAssetDefinition(input);
        expect(result.lockerSpec?.doorSide).toBe(doorSide);
      }
    });

    it('should handle negative door position (left offset)', async () => {
      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 0.9144,
        doorHeight: 1.8288,
        doorPositionX: -0.3048, // Door shifted left
        doorPositionY: 0.1524,
      };

      const input = {
        name: 'Left-Offset Door Locker',
        category: AssetCategory.STORAGE_UNIT,
        modelType: 'primitive' as const,
        dimensions: { width: 1.524, height: 2.4384, depth: 1.524 },
        gridUnits: { x: 3, z: 3 },
        lockerSpec,
      };

      mockDb.insert.mockResolvedValue([1]);
      mockDb.first.mockResolvedValue({
        id: 'asset-offset',
        ...input,
        dimensions: JSON.stringify(input.dimensions),
        grid_units: JSON.stringify(input.gridUnits),
        locker_spec: JSON.stringify(lockerSpec),
        is_builtin: false,
        is_smart: true,
        can_rotate: true,
        can_stack: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await AssetService.createAssetDefinition(input);
      expect(result.lockerSpec?.doorPositionX).toBe(-0.3048);
    });
  });
});

