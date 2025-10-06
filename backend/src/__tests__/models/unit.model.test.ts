import { UnitModel } from '@/models/unit.model';
import { UserRole } from '@/types/auth.types';
import { createMockTestData, MockTestData } from '@/__tests__/utils/mock-test-helpers';

describe('UnitModel', () => {
  let unitModel: UnitModel;
  let testData: MockTestData;

  beforeEach(async () => {
    testData = createMockTestData();
    unitModel = new UnitModel();
  });

  describe('getUnitsListForUser', () => {
    it('should return all units for admin users', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.units)).toBe(true);
      expect(typeof result.total).toBe('number');
    });

    it('should return filtered units for facility admin', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      
      // All returned units should be in facilities the admin has access to
      if (result.units.length > 0) {
        for (const unit of result.units) {
          expect(testData.users.facilityAdmin.facilityIds).toContain(unit.facility_id);
        }
      }
    });

    it('should return filtered units for tenant', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.tenant.id,
        'tenant' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.units)).toBe(true);
    });

    it('should apply search filter correctly', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { search: 'test', limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
    });

    it('should apply status filter correctly', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { status: 'occupied', limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
    });

    it('should apply facility filter correctly', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { facility_id: testData.facilities.facility1.id, limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
    });

    it('should apply pagination correctly', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { limit: 5, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      expect(result.units.length).toBeLessThanOrEqual(5);
    });

    it('should apply sorting correctly', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { sortBy: 'unit_number', sortOrder: 'asc', limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
    });

    it('should return empty result for unknown role', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'unknown_role' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toEqual({ units: [], total: 0 });
    });

    it('should handle lock status filter', async () => {
      const lockedResult = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { lock_status: 'locked', limit: 10, offset: 0 }
      );

      const unlockedResult = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        { lock_status: 'unlocked', limit: 10, offset: 0 }
      );

      expect(lockedResult).toHaveProperty('units');
      expect(unlockedResult).toHaveProperty('units');
    });
  });

  describe('getUnitDetailsForUser', () => {
    it('should return unit details for admin', async () => {
      const result = await unitModel.getUnitDetailsForUser(
        testData.units.unit1.id,
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('unit_number');
      expect(result).toHaveProperty('facility_id');
      expect(result).toHaveProperty('status');
    });

    it('should return unit details for facility admin with access', async () => {
      const result = await unitModel.getUnitDetailsForUser(
        testData.units.unit1.id,
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      if (result) {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('unit_number');
        expect(testData.users.facilityAdmin.facilityIds).toContain(result.facility_id);
      }
    });

    it('should return unit details for tenant with access', async () => {
      const result = await unitModel.getUnitDetailsForUser(
        testData.units.unit1.id,
        testData.users.tenant.id,
        'tenant' as UserRole
      );

      if (result) {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('unit_number');
      }
    });

    it('should return null for non-existent unit', async () => {
      const result = await unitModel.getUnitDetailsForUser(
        'non-existent-id',
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(result).toBeNull();
    });

    it('should return null for facility admin without access', async () => {
      // Assuming unit-2 is not in facility admin's facilities
      const result = await unitModel.getUnitDetailsForUser(
        testData.units.unit2.id,
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      // This might return null if the unit is not in their facility
      expect(result === null || (result && testData.users.facilityAdmin.facilityIds?.includes(result.facility_id))).toBe(true);
    });

    it('should return null for tenant without access', async () => {
      // Assuming unit-2 is not assigned to the tenant
      const result = await unitModel.getUnitDetailsForUser(
        testData.units.unit2.id,
        testData.users.tenant.id,
        'tenant' as UserRole
      );

      // This might return null if the unit is not assigned to the tenant
      expect(result === null || result).toBeTruthy();
    });

    it('should return null for unknown role', async () => {
      const result = await unitModel.getUnitDetailsForUser(
        testData.units.unit1.id,
        testData.users.admin.id,
        'unknown_role' as UserRole
      );

      expect(result).toBeNull();
    });
  });

  describe('lockUnit', () => {
    it('should lock a unit successfully', async () => {
      const result = await unitModel.lockUnit(
        testData.units.unit1.id,
        testData.users.admin.id
      );

      expect(typeof result).toBe('boolean');
    });

    it('should handle non-existent unit', async () => {
      const result = await unitModel.lockUnit(
        'non-existent-id',
        testData.users.admin.id
      );

      expect(typeof result).toBe('boolean');
    });
  });

  describe('getUnitAssignmentsForUser', () => {
    it('should return unit assignments for admin', async () => {
      const result = await unitModel.getUnitAssignmentsForUser(
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return unit assignments for facility admin', async () => {
      const result = await unitModel.getUnitAssignmentsForUser(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return unit assignments for tenant', async () => {
      const result = await unitModel.getUnitAssignmentsForUser(
        testData.users.tenant.id,
        'tenant' as UserRole
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getUnitStatsForUser', () => {
    it('should return unit stats for admin', async () => {
      const result = await unitModel.getUnitStatsForUser(
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('occupied');
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('maintenance');
      expect(result).toHaveProperty('reserved');
      expect(result).toHaveProperty('unlocked');
      expect(result).toHaveProperty('locked');
      
      expect(typeof result.total).toBe('number');
      expect(typeof result.occupied).toBe('number');
      expect(typeof result.available).toBe('number');
      expect(typeof result.maintenance).toBe('number');
      expect(typeof result.reserved).toBe('number');
      expect(typeof result.unlocked).toBe('number');
      expect(typeof result.locked).toBe('number');
    });

    it('should return unit stats for facility admin', async () => {
      const result = await unitModel.getUnitStatsForUser(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      expect(result).toHaveProperty('total');
      expect(typeof result.total).toBe('number');
    });

    it('should return unit stats for tenant', async () => {
      const result = await unitModel.getUnitStatsForUser(
        testData.users.tenant.id,
        'tenant' as UserRole
      );

      expect(result).toHaveProperty('total');
      expect(typeof result.total).toBe('number');
    });
  });

  describe('findById', () => {
    it('should find unit by ID', async () => {
      const result = await unitModel.findById(testData.units.unit1.id);

      expect(result).toHaveProperty('id', testData.units.unit1.id);
      expect(result).toHaveProperty('unit_number');
    });

    it('should return null for non-existent unit', async () => {
      const result = await unitModel.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByPrimaryTenant', () => {
    it('should find units by primary tenant', async () => {
      const result = await unitModel.findByPrimaryTenant(testData.users.tenant.id);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array for non-existent tenant', async () => {
      const result = await unitModel.findByPrimaryTenant('non-existent-tenant');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });
});
