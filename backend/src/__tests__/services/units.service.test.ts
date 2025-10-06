import { UnitsService } from '@/services/units.service';
import { UserRole } from '@/types/auth.types';
import { createMockTestData, MockTestData } from '@/__tests__/utils/mock-test-helpers';
import { UnitModel } from '@/models/unit.model';

// Mock the UnitModel
jest.mock('@/models/unit.model');

describe('UnitsService', () => {
  let unitsService: UnitsService;
  let testData: MockTestData;
  let mockUnitModel: jest.Mocked<UnitModel>;

  beforeEach(async () => {
    testData = createMockTestData();
    
    // Create a mock UnitModel
    mockUnitModel = {
      getUnitsListForUser: jest.fn(),
      getUnitDetailsForUser: jest.fn(),
      findById: jest.fn(),
      lockUnit: jest.fn(),
      getUnitAssignmentsForUser: jest.fn(),
    } as any;

    // Mock the UnitModel constructor
    (UnitModel as jest.MockedClass<typeof UnitModel>).mockImplementation(() => mockUnitModel);
    
    // Reset the singleton instance to ensure fresh mock
    (UnitsService as any).instance = undefined;
    unitsService = UnitsService.getInstance();
  });

  describe('getUnits', () => {
    it('should get units for admin user', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1, testData.units.unit2],
        total: 2
      });

      const result = await unitsService.getUnits(
        testData.users.admin.id,
        'admin' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.units)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin',
        { limit: 10, offset: 0 }
      );
    });

    it('should get units for facility admin', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1],
        total: 1
      });

      const result = await unitsService.getUnits(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.units)).toBe(true);
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.facilityAdmin.id,
        'facility_admin',
        { limit: 10, offset: 0 }
      );
    });

    it('should get units for tenant', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1],
        total: 1
      });

      const result = await unitsService.getUnits(
        testData.users.tenant.id,
        'tenant' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.units)).toBe(true);
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.tenant.id,
        'tenant',
        { limit: 10, offset: 0 }
      );
    });

    it('should handle empty filters', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1, testData.units.unit2],
        total: 2
      });

      const result = await unitsService.getUnits(
        testData.users.admin.id,
        'admin' as UserRole,
        {}
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.units)).toBe(true);
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin',
        {}
      );
    });

    it('should handle filters with search', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1],
        total: 1
      });

      const result = await unitsService.getUnits(
        testData.users.admin.id,
        'admin' as UserRole,
        { search: 'A-101', limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin',
        { search: 'A-101', limit: 10, offset: 0 }
      );
    });

    it('should handle filters with status', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1],
        total: 1
      });

      const result = await unitsService.getUnits(
        testData.users.admin.id,
        'admin' as UserRole,
        { status: 'occupied', limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin',
        { status: 'occupied', limit: 10, offset: 0 }
      );
    });

    it('should handle filters with facility_id', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1],
        total: 1
      });

      const result = await unitsService.getUnits(
        testData.users.admin.id,
        'admin' as UserRole,
        { facility_id: testData.facilities.facility1.id, limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin',
        { facility_id: testData.facilities.facility1.id, limit: 10, offset: 0 }
      );
    });

    it('should handle pagination', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit2],
        total: 2
      });

      const result = await unitsService.getUnits(
        testData.users.admin.id,
        'admin' as UserRole,
        { limit: 1, offset: 1 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin',
        { limit: 1, offset: 1 }
      );
    });

    it('should handle sorting', async () => {
      mockUnitModel.getUnitsListForUser.mockResolvedValue({
        units: [testData.units.unit1, testData.units.unit2],
        total: 2
      });

      const result = await unitsService.getUnits(
        testData.users.admin.id,
        'admin' as UserRole,
        { sort_by: 'unit_number', sort_order: 'asc', limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(mockUnitModel.getUnitsListForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin',
        { sort_by: 'unit_number', sort_order: 'asc', limit: 10, offset: 0 }
      );
    });

    it('should throw error for invalid user', async () => {
      mockUnitModel.getUnitsListForUser.mockRejectedValue(new Error('Invalid user'));

      await expect(
        unitsService.getUnits('invalid-user', 'admin' as UserRole, {})
      ).rejects.toThrow('Invalid user');
    });
  });

  describe('getUnitDetails', () => {
    it('should get unit details for admin', async () => {
      mockUnitModel.findById.mockResolvedValue(testData.units.unit1);
      mockUnitModel.getUnitDetailsForUser.mockResolvedValue(testData.units.unit1);

      const result = await unitsService.getUnitDetails(
        testData.units.unit1.id,
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(result).toEqual(testData.units.unit1);
      expect(mockUnitModel.getUnitDetailsForUser).toHaveBeenCalledWith(
        testData.units.unit1.id,
        testData.users.admin.id,
        'admin'
      );
    });

    it('should get unit details for facility admin with access', async () => {
      mockUnitModel.findById.mockResolvedValue(testData.units.unit1);
      mockUnitModel.getUnitDetailsForUser.mockResolvedValue(testData.units.unit1);

      const result = await unitsService.getUnitDetails(
        testData.units.unit1.id,
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      expect(result).toEqual(testData.units.unit1);
      expect(mockUnitModel.getUnitDetailsForUser).toHaveBeenCalledWith(
        testData.units.unit1.id,
        testData.users.facilityAdmin.id,
        'facility_admin'
      );
    });

    it('should get unit details for tenant with access', async () => {
      mockUnitModel.findById.mockResolvedValue(testData.units.unit1);
      mockUnitModel.getUnitDetailsForUser.mockResolvedValue(testData.units.unit1);

      const result = await unitsService.getUnitDetails(
        testData.units.unit1.id,
        testData.users.tenant.id,
        'tenant' as UserRole
      );

      expect(result).toEqual(testData.units.unit1);
      expect(mockUnitModel.getUnitDetailsForUser).toHaveBeenCalledWith(
        testData.units.unit1.id,
        testData.users.tenant.id,
        'tenant'
      );
    });

    it('should return null for non-existent unit', async () => {
      mockUnitModel.findById.mockResolvedValue(null);
      mockUnitModel.getUnitDetailsForUser.mockResolvedValue(null);

      const result = await unitsService.getUnitDetails(
        'non-existent-id',
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(result).toBeNull();
    });

    it('should return null for facility admin without access', async () => {
      mockUnitModel.findById.mockResolvedValue(testData.units.unit2);
      mockUnitModel.getUnitDetailsForUser.mockResolvedValue(null);

      await expect(
        unitsService.getUnitDetails(
          testData.units.unit2.id,
          testData.users.facilityAdmin.id,
          'facility_admin' as UserRole
        )
      ).rejects.toThrow('Access denied');
    });

    it('should return null for tenant without access', async () => {
      mockUnitModel.findById.mockResolvedValue(testData.units.unit2);
      mockUnitModel.getUnitDetailsForUser.mockResolvedValue(null);

      await expect(
        unitsService.getUnitDetails(
          testData.units.unit2.id,
          testData.users.tenant.id,
          'tenant' as UserRole
        )
      ).rejects.toThrow('Access denied');
    });

    it('should throw error for invalid user', async () => {
      mockUnitModel.findById.mockResolvedValue(testData.units.unit1);
      mockUnitModel.getUnitDetailsForUser.mockRejectedValue(new Error('Invalid user'));

      await expect(
        unitsService.getUnitDetails('unit-1', 'invalid-user', 'admin' as UserRole)
      ).rejects.toThrow('Invalid user');
    });
  });

  describe('lockUnit', () => {
    it('should lock unit successfully', async () => {
      mockUnitModel.lockUnit.mockResolvedValue(true);

      const result = await unitsService.lockUnit(
        testData.units.unit1.id,
        testData.users.admin.id
      );

      expect(result).toBe(true);
      expect(mockUnitModel.lockUnit).toHaveBeenCalledWith(
        testData.units.unit1.id,
        testData.users.admin.id
      );
    });

    it('should handle non-existent unit', async () => {
      mockUnitModel.lockUnit.mockResolvedValue(false);

      const result = await unitsService.lockUnit(
        'non-existent-id',
        testData.users.admin.id
      );

      expect(result).toBe(false);
      expect(mockUnitModel.lockUnit).toHaveBeenCalledWith(
        'non-existent-id',
        testData.users.admin.id
      );
    });

    it('should throw error for invalid user', async () => {
      mockUnitModel.lockUnit.mockRejectedValue(new Error('Invalid user'));

      await expect(
        unitsService.lockUnit('unit-1', 'invalid-user')
      ).rejects.toThrow('Invalid user');
    });
  });

  describe('getUnitAssignments', () => {
    it('should get unit assignments for admin', async () => {
      const mockAssignments = [
        {
          id: 'assignment-1',
          unit_id: testData.units.unit1.id,
          tenant_id: testData.users.tenant.id,
          is_primary: true,
          access_type: 'full' as const,
          access_granted_at: new Date(),
          access_expires_at: null,
          granted_by: testData.users.admin.id,
          notes: null,
          access_permissions: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      ];
      mockUnitModel.getUnitAssignmentsForUser.mockResolvedValue(mockAssignments);

      const result = await unitsService.getUnitAssignments(
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(result).toEqual(mockAssignments);
      expect(mockUnitModel.getUnitAssignmentsForUser).toHaveBeenCalledWith(
        testData.users.admin.id,
        'admin'
      );
    });

    it('should get unit assignments for facility admin', async () => {
      const mockAssignments = [
        {
          id: 'assignment-1',
          unit_id: testData.units.unit1.id,
          tenant_id: testData.users.tenant.id,
          is_primary: true,
          access_type: 'full' as const,
          access_granted_at: new Date(),
          access_expires_at: null,
          granted_by: testData.users.facilityAdmin.id,
          notes: null,
          access_permissions: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      ];
      mockUnitModel.getUnitAssignmentsForUser.mockResolvedValue(mockAssignments);

      const result = await unitsService.getUnitAssignments(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      expect(result).toEqual(mockAssignments);
      expect(mockUnitModel.getUnitAssignmentsForUser).toHaveBeenCalledWith(
        testData.users.facilityAdmin.id,
        'facility_admin'
      );
    });

    it('should get unit assignments for tenant', async () => {
      const mockAssignments = [
        {
          id: 'assignment-1',
          unit_id: testData.units.unit1.id,
          tenant_id: testData.users.tenant.id,
          is_primary: true,
          access_type: 'full' as const,
          access_granted_at: new Date(),
          access_expires_at: null,
          granted_by: testData.users.admin.id,
          notes: null,
          access_permissions: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      ];
      mockUnitModel.getUnitAssignmentsForUser.mockResolvedValue(mockAssignments);

      const result = await unitsService.getUnitAssignments(
        testData.users.tenant.id,
        'tenant' as UserRole
      );

      expect(result).toEqual(mockAssignments);
      expect(mockUnitModel.getUnitAssignmentsForUser).toHaveBeenCalledWith(
        testData.users.tenant.id,
        'tenant'
      );
    });

    it('should throw error for invalid user', async () => {
      mockUnitModel.getUnitAssignmentsForUser.mockRejectedValue(new Error('Invalid user'));

      await expect(
        unitsService.getUnitAssignments('invalid-user', 'admin' as UserRole)
      ).rejects.toThrow('Invalid user');
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = UnitsService.getInstance();
      const instance2 = UnitsService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
});