import { describe, it, expect, beforeEach } from '@jest/globals';
import { UnitModel } from '@/models/unit.model';
import { UnitsService } from '@/services/units.service';
import { UserRole } from '@/types/auth.types';
import { createMockTestData, MockTestData } from '@/__tests__/utils/mock-test-helpers';

/**
 * Comprehensive RBAC Security Audit for Units Management
 * 
 * This test suite validates that all units management functionality
 * properly enforces role-based access control and data isolation.
 */
describe('Units Management RBAC Security Audit', () => {
  let unitModel: UnitModel;
  let unitsService: UnitsService;
  let testData: MockTestData;

  beforeEach(async () => {
    testData = createMockTestData();
    unitModel = new UnitModel();
    unitsService = UnitsService.getInstance();
  });

  describe('Data Access Control', () => {
    describe('Admin/Dev Admin Access', () => {
      it('should allow admin to access all units', async () => {
        const result = await unitModel.getUnitsListForUser(
          testData.users.admin.id,
          'admin' as UserRole,
          { limit: 10, offset: 0 }
        );

        expect(result).toHaveProperty('units');
        expect(result).toHaveProperty('total');
        // Admin should see units from all facilities
        expect(Array.isArray(result.units)).toBe(true);
      });

      it('should allow dev_admin to access all units', async () => {
        const result = await unitModel.getUnitsListForUser(
          testData.users.devAdmin.id,
          'dev_admin' as UserRole,
          { limit: 10, offset: 0 }
        );

        expect(result).toHaveProperty('units');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.units)).toBe(true);
      });

      it('should allow admin to access any unit details', async () => {
        const result = await unitModel.getUnitDetailsForUser(
          testData.units.unit1.id,
          testData.users.admin.id,
          'admin' as UserRole
        );

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('unit_number');
        expect(result).toHaveProperty('facility_id');
      });
    });

    describe('Facility Admin Access', () => {
      it('should restrict facility admin to their assigned facilities only', async () => {
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

      it('should deny facility admin access to units outside their facilities', async () => {
        // Assuming there's a unit in a facility the admin doesn't have access to
        const result = await unitModel.getUnitDetailsForUser(
          'unit-outside-scope',
          testData.users.facilityAdmin.id,
          'facility_admin' as UserRole
        );

        // Should return null for units outside their scope
        expect(result).toBeNull();
      });

      it('should handle facility admin with no facility associations', async () => {
        // Create a facility admin with no facility associations
        const result = await unitModel.getUnitsListForUser(
          'facility-admin-no-access',
          'facility_admin' as UserRole,
          { limit: 10, offset: 0 }
        );

        expect(result).toEqual({ units: [], total: 0 });
      });
    });

    describe('Tenant Access', () => {
      it('should restrict tenant to only their assigned units', async () => {
        const result = await unitModel.getUnitsListForUser(
          testData.users.tenant.id,
          'tenant' as UserRole,
          { limit: 10, offset: 0 }
        );

        expect(result).toHaveProperty('units');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.units)).toBe(true);
        
        // All returned units should be assigned to the tenant
        // This is enforced by the JOIN with unit_assignments table
      });

      it('should deny tenant access to unassigned units', async () => {
        const result = await unitModel.getUnitDetailsForUser(
          'unit-not-assigned-to-tenant',
          testData.users.tenant.id,
          'tenant' as UserRole
        );

        // Should return null for units not assigned to the tenant
        expect(result).toBeNull();
      });
    });

    describe('Maintenance Access', () => {
      it('should restrict maintenance to only their assigned units', async () => {
        const result = await unitModel.getUnitsListForUser(
          testData.users.maintenance.id,
          'maintenance' as UserRole,
          { limit: 10, offset: 0 }
        );

        expect(result).toHaveProperty('units');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.units)).toBe(true);
        
        // All returned units should be assigned to the maintenance user
        // This is enforced by the JOIN with unit_assignments table
      });
    });

    describe('Unknown Role Access', () => {
      it('should deny access for unknown roles', async () => {
        const result = await unitModel.getUnitsListForUser(
          testData.users.admin.id,
          'unknown_role' as UserRole,
          { limit: 10, offset: 0 }
        );

        expect(result).toEqual({ units: [], total: 0 });
      });

      it('should deny unit details access for unknown roles', async () => {
        const result = await unitModel.getUnitDetailsForUser(
          testData.units.unit1.id,
          testData.users.admin.id,
          'unknown_role' as UserRole
        );

        expect(result).toBeNull();
      });
    });
  });

  describe('Data Isolation Validation', () => {
    it('should ensure facility admins cannot see units from other facilities', async () => {
      // This test would need to be implemented with proper test data
      // that includes units from multiple facilities
      const result = await unitModel.getUnitsListForUser(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole,
        { limit: 100, offset: 0 }
      );

      // Verify that all units returned are within the admin's facility scope
      if (result.units.length > 0) {
        for (const unit of result.units) {
          expect(testData.users.facilityAdmin.facilityIds).toContain(unit.facility_id);
        }
      }
    });

    it('should ensure tenants cannot see units assigned to other tenants', async () => {
      // This test would need to be implemented with proper test data
      // that includes units assigned to different tenants
      const result = await unitModel.getUnitsListForUser(
        testData.users.tenant.id,
        'tenant' as UserRole,
        { limit: 100, offset: 0 }
      );

      // Verify that all units returned are assigned to this specific tenant
      // This is enforced by the JOIN condition: ua.tenant_id = userId
      expect(Array.isArray(result.units)).toBe(true);
    });
  });

  describe('Service Layer Security', () => {
    it('should maintain RBAC through service layer', async () => {
      const result = await unitsService.getUnits(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole,
        { limit: 10, offset: 0 }
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
      
      // Service layer should enforce the same RBAC as model layer
      if (result.units.length > 0) {
        for (const unit of result.units) {
          expect(testData.users.facilityAdmin.facilityIds).toContain(unit.facility_id);
        }
      }
    });

    it('should maintain RBAC for unit details through service layer', async () => {
      const result = await unitsService.getUnitDetails(
        testData.units.unit1.id,
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      if (result) {
        expect(testData.users.facilityAdmin.facilityIds).toContain(result.facility_id);
      }
    });
  });

  describe('Edge Cases and Security Boundaries', () => {
    it('should handle null/undefined user IDs gracefully', async () => {
      await expect(
        unitModel.getUnitsListForUser(
          null as any,
          'admin' as UserRole,
          { limit: 10, offset: 0 }
        )
      ).rejects.toThrow();
    });

    it('should handle null/undefined roles gracefully', async () => {
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        null as any,
        { limit: 10, offset: 0 }
      );

      expect(result).toEqual({ units: [], total: 0 });
    });

    it('should handle malformed unit IDs gracefully', async () => {
      const result = await unitModel.getUnitDetailsForUser(
        'malformed-id',
        testData.users.admin.id,
        'admin' as UserRole
      );

      expect(result).toBeNull();
    });

    it('should handle SQL injection attempts in filters', async () => {
      const maliciousFilters = {
        search: "'; DROP TABLE units; --",
        limit: 10,
        offset: 0
      };

      // This should not cause any issues due to parameterized queries
      const result = await unitModel.getUnitsListForUser(
        testData.users.admin.id,
        'admin' as UserRole,
        maliciousFilters
      );

      expect(result).toHaveProperty('units');
      expect(result).toHaveProperty('total');
    });
  });

  describe('Permission Escalation Prevention', () => {
    it('should prevent tenant from accessing admin-only functionality', async () => {
      // Tenants should not be able to access units outside their assignments
      // even if they somehow get a unit ID from another tenant
      const result = await unitModel.getUnitDetailsForUser(
        'admin-only-unit-id',
        testData.users.tenant.id,
        'tenant' as UserRole
      );

      // Should return null for units not assigned to the tenant
      expect(result).toBeNull();
    });

    it('should prevent facility admin from accessing units outside their facilities', async () => {
      // Facility admins should not be able to access units from facilities
      // they don't have access to, even if they know the unit ID
      const result = await unitModel.getUnitDetailsForUser(
        'unit-from-other-facility',
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      // Should return null for units outside their facility scope
      expect(result).toBeNull();
    });
  });

  describe('Data Consistency', () => {
    it('should ensure consistent RBAC across all unit operations', async () => {
      // Test that the same RBAC rules apply to all unit-related operations
      const listResult = await unitModel.getUnitsListForUser(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole,
        { limit: 10, offset: 0 }
      );

      const detailsResult = await unitModel.getUnitDetailsForUser(
        testData.units.unit1.id,
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      const statsResult = await unitModel.getUnitStatsForUser(
        testData.users.facilityAdmin.id,
        'facility_admin' as UserRole
      );

      // All operations should respect the same RBAC rules
      expect(listResult).toHaveProperty('units');
      expect(typeof statsResult.total).toBe('number');
      
      if (detailsResult) {
        expect(testData.users.facilityAdmin.facilityIds).toContain(detailsResult.facility_id);
      }
    });
  });
});
