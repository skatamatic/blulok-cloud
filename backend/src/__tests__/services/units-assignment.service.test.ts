/**
 * UnitsService - Tenant Assignment Tests
 * 
 * Tests for tenant assignment/unassignment functionality and event emission
 */

import { UnitsService } from '@/services/units.service';
import { UnitModel } from '@/models/unit.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { UnitAssignmentEventsService } from '@/services/events/unit-assignment-events.service';

describe('UnitsService - Tenant Assignment', () => {
  let unitsService: UnitsService;
  let mockUnitModel: jest.Mocked<UnitModel>;
  let mockAssignmentModel: jest.Mocked<UnitAssignmentModel>;
  let mockEventService: jest.Mocked<UnitAssignmentEventsService>;

  beforeEach(() => {
    // Reset singleton
    (UnitsService as any).instance = undefined;
    unitsService = UnitsService.getInstance();

    // Get mocked instances
    mockUnitModel = (unitsService as any).unitModel;
    mockAssignmentModel = (unitsService as any).unitAssignmentModel;
    mockEventService = (unitsService as any).eventService;
  });

  describe('assignTenant', () => {
    const unitId = '550e8400-e29b-41d4-a716-446655440011';
    const tenantId = 'tenant-1';
    const facilityId = '550e8400-e29b-41d4-a716-446655440001';

    it('should create unit assignment successfully', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
        unit_number: 'A-101',
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue(null);
      mockAssignmentModel.create = jest.fn().mockResolvedValue({
        id: 'assignment-1',
        unit_id: unitId,
        tenant_id: tenantId,
      });

      await unitsService.assignTenant(unitId, tenantId, {
        accessType: 'full',
        isPrimary: true,
        performedBy: 'admin-1',
        source: 'api',
      });

      expect(mockAssignmentModel.create).toHaveBeenCalledWith({
        unit_id: unitId,
        tenant_id: tenantId,
        access_type: 'full',
        is_primary: true,
      });
    });

    it('should emit tenant assigned event', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
        unit_number: 'A-101',
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue(null);
      mockAssignmentModel.create = jest.fn().mockResolvedValue({
        id: 'assignment-1',
      });

      mockEventService.emitTenantAssigned = jest.fn();

      await unitsService.assignTenant(unitId, tenantId, {
        accessType: 'full',
        isPrimary: true,
        performedBy: 'admin-1',
        source: 'fms_sync',
        syncLogId: 'sync-1',
      });

      expect(mockEventService.emitTenantAssigned).toHaveBeenCalledWith({
        unitId,
        facilityId,
        tenantId,
        accessType: 'full',
        metadata: {
          source: 'fms_sync',
          performedBy: 'admin-1',
          syncLogId: 'sync-1',
        },
      });
    });

    it('should skip if assignment already exists', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue({
        id: 'existing-assignment',
        unit_id: unitId,
        tenant_id: tenantId,
      });

      mockAssignmentModel.create = jest.fn();

      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
      });

      expect(mockAssignmentModel.create).not.toHaveBeenCalled();
    });

    it('should throw error if unit not found', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue(null);

      await expect(
        unitsService.assignTenant(unitId, tenantId, {
          performedBy: 'admin-1',
        })
      ).rejects.toThrow('Unit not found');
    });
  });

  describe('unassignTenant', () => {
    const unitId = '550e8400-e29b-41d4-a716-446655440011';
    const tenantId = 'tenant-1';
    const facilityId = '550e8400-e29b-41d4-a716-446655440001';

    it('should delete unit assignment successfully', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
        unit_number: 'A-101',
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue({
        id: 'assignment-1',
        unit_id: unitId,
        tenant_id: tenantId,
        access_type: 'full',
      });

      mockAssignmentModel.deleteByUnitAndTenant = jest.fn().mockResolvedValue(true);

      await unitsService.unassignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
        source: 'api',
      });

      expect(mockAssignmentModel.deleteByUnitAndTenant).toHaveBeenCalledWith(unitId, tenantId);
    });

    it('should emit tenant unassigned event', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
        unit_number: 'A-101',
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue({
        id: 'assignment-1',
        unit_id: unitId,
        tenant_id: tenantId,
        access_type: 'full',
      });

      mockAssignmentModel.deleteByUnitAndTenant = jest.fn().mockResolvedValue(true);
      mockEventService.emitTenantUnassigned = jest.fn();

      await unitsService.unassignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
        source: 'fms_sync',
        syncLogId: 'sync-1',
      });

      expect(mockEventService.emitTenantUnassigned).toHaveBeenCalledWith({
        unitId,
        facilityId,
        tenantId,
        accessType: 'full',
        metadata: {
          source: 'fms_sync',
          performedBy: 'admin-1',
          syncLogId: 'sync-1',
        },
      });
    });

    it('should skip if assignment does not exist', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue(null);
      mockAssignmentModel.deleteByUnitAndTenant = jest.fn();

      await unitsService.unassignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
      });

      expect(mockAssignmentModel.deleteByUnitAndTenant).not.toHaveBeenCalled();
    });

    it('should throw error if unit not found', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue(null);

      await expect(
        unitsService.unassignTenant(unitId, tenantId, {
          performedBy: 'admin-1',
        })
      ).rejects.toThrow('Unit not found');
    });
  });

  describe('Event Metadata', () => {
    const unitId = '550e8400-e29b-41d4-a716-446655440011';
    const tenantId = 'tenant-1';
    const facilityId = '550e8400-e29b-41d4-a716-446655440001';

    it('should include source in event metadata', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue(null);
      mockAssignmentModel.create = jest.fn().mockResolvedValue({ id: 'assignment-1' });
      mockEventService.emitTenantAssigned = jest.fn();

      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
        source: 'manual',
      });

      expect(mockEventService.emitTenantAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            source: 'manual',
          }),
        })
      );
    });

    it('should include performedBy in event metadata', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue(null);
      mockAssignmentModel.create = jest.fn().mockResolvedValue({ id: 'assignment-1' });
      mockEventService.emitTenantAssigned = jest.fn();

      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'facility-admin-1',
        source: 'api',
      });

      expect(mockEventService.emitTenantAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            performedBy: 'facility-admin-1',
          }),
        })
      );
    });

    it('should include syncLogId in event metadata when from FMS', async () => {
      mockUnitModel.findById = jest.fn().mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      mockAssignmentModel.findByUnitAndTenant = jest.fn().mockResolvedValue(null);
      mockAssignmentModel.create = jest.fn().mockResolvedValue({ id: 'assignment-1' });
      mockEventService.emitTenantAssigned = jest.fn();

      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
        source: 'fms_sync',
        syncLogId: 'sync-123',
      });

      expect(mockEventService.emitTenantAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            syncLogId: 'sync-123',
          }),
        })
      );
    });
  });
});
