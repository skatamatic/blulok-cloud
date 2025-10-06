/**
 * FMS Integration Boundary Tests
 * 
 * Tests the service boundaries with selective mocking.
 * Unmocks FMS and Units services to test real integration.
 */

// Unmock the services we want to test
jest.unmock('@/services/fms/fms.service');
jest.unmock('@/services/units.service');
jest.unmock('@/services/events/unit-assignment-events.service');

import { UnitsService } from '@/services/units.service';
import { UnitAssignmentEventsService } from '@/services/events/unit-assignment-events.service';

describe('FMS Integration - Service Boundaries', () => {
  let unitsService: UnitsService;
  let eventService: UnitAssignmentEventsService;
  let emittedEvents: any[];

  beforeEach(() => {
    // Reset singletons
    (UnitsService as any).instance = undefined;
    
    unitsService = UnitsService.getInstance();
    eventService = UnitAssignmentEventsService.getInstance();

    // Track events
    emittedEvents = [];
    eventService.onAssignmentChanged((event) => {
      emittedEvents.push(event);
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    eventService.removeAllListeners();
  });

  describe('UnitsService Event Emission', () => {
    it('should emit tenant:assigned event when assigning tenant to unit', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      // Get mocked models
      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      // Configure mocks
      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
        unit_number: 'A-101',
      });

      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue(null);
      assignmentModelInstance.create.mockResolvedValue({
        id: 'assignment-1',
        unit_id: unitId,
        tenant_id: tenantId,
      });

      // Execute
      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
        source: 'fms_sync',
        syncLogId: 'sync-123',
      });

      // Verify event was emitted
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        eventType: 'assigned',
        unitId,
        tenantId,
        facilityId,
        accessType: 'full',
        metadata: {
          source: 'fms_sync',
          performedBy: 'admin-1',
          syncLogId: 'sync-123',
        },
      });
      expect(emittedEvents[0].timestamp).toBeInstanceOf(Date);
    });

    it('should emit tenant:unassigned event when removing tenant from unit', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      // Get mocked models
      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      // Configure mocks
      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
        unit_number: 'A-101',
      });

      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue({
        id: 'assignment-1',
        unit_id: unitId,
        tenant_id: tenantId,
        access_type: 'full',
      });

      assignmentModelInstance.deleteByUnitAndTenant.mockResolvedValue(true);

      // Execute
      await unitsService.unassignTenant(unitId, tenantId, {
        performedBy: 'facility-admin-1',
        source: 'manual',
      });

      // Verify event was emitted
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]).toMatchObject({
        eventType: 'unassigned',
        unitId,
        tenantId,
        facilityId,
        accessType: 'full',
        metadata: {
          source: 'manual',
          performedBy: 'facility-admin-1',
        },
      });
    });

    it('should include syncLogId in event metadata when source is fms_sync', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      // Get mocked models
      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      // Configure mocks
      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue(null);
      assignmentModelInstance.create.mockResolvedValue({ id: 'assignment-1' });

      // Execute with FMS sync source
      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
        source: 'fms_sync',
        syncLogId: 'sync-log-abc-123',
      });

      // Verify syncLogId is in event
      expect(emittedEvents[0].metadata.syncLogId).toBe('sync-log-abc-123');
      expect(emittedEvents[0].metadata.source).toBe('fms_sync');
    });

    it('should not include syncLogId when source is not fms_sync', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      // Get mocked models
      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      // Configure mocks
      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue(null);
      assignmentModelInstance.create.mockResolvedValue({ id: 'assignment-1' });

      // Execute with API source (no syncLogId)
      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
        source: 'api',
      });

      // Verify syncLogId is NOT in event
      expect(emittedEvents[0].metadata.syncLogId).toBeUndefined();
      expect(emittedEvents[0].metadata.source).toBe('api');
    });
  });

  describe('Error Handling Integration', () => {
    it('should throw error if unit not found', async () => {
      const unitModelInstance = (unitsService as any).unitModel;

      // Unit doesn't exist
      unitModelInstance.findById.mockResolvedValue(null);

      await expect(
        unitsService.assignTenant('nonexistent-unit', 'tenant-1', {
          performedBy: 'admin-1',
        })
      ).rejects.toThrow('Unit not found');

      // No events should be emitted
      expect(emittedEvents).toHaveLength(0);
    });

    it('should skip and log warning if assignment already exists', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      // Assignment already exists
      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue({
        id: 'existing-assignment',
        unit_id: unitId,
        tenant_id: tenantId,
      });

      assignmentModelInstance.create.mockResolvedValue({ id: 'should-not-be-called' });

      // Execute - should not throw, just log warning
      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
      });

      // Should NOT create new assignment
      expect(assignmentModelInstance.create).not.toHaveBeenCalled();

      // Should NOT emit event
      expect(emittedEvents).toHaveLength(0);
    });

    it('should skip and log warning if assignment does not exist on unassign', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      // No assignment exists
      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue(null);
      assignmentModelInstance.deleteByUnitAndTenant.mockResolvedValue(false);

      // Execute - should not throw, just log warning
      await unitsService.unassignTenant(unitId, tenantId, {
        performedBy: 'admin-1',
      });

      // Should NOT delete
      expect(assignmentModelInstance.deleteByUnitAndTenant).not.toHaveBeenCalled();

      // Should NOT emit event
      expect(emittedEvents).toHaveLength(0);
    });
  });

  describe('Metadata Propagation', () => {
    it('should propagate performedBy through service chain', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';
      const performedBy = 'facility-admin-xyz';

      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue(null);
      assignmentModelInstance.create.mockResolvedValue({ id: 'assignment-1' });

      // Execute with specific performedBy
      await unitsService.assignTenant(unitId, tenantId, {
        performedBy,
        source: 'api',
      });

      // Verify performedBy is in event
      expect(emittedEvents[0].metadata.performedBy).toBe(performedBy);
    });

    it('should propagate all metadata fields correctly', async () => {
      const unitId = '550e8400-e29b-41d4-a716-446655440011';
      const tenantId = 'tenant-1';
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      const unitModelInstance = (unitsService as any).unitModel;
      const assignmentModelInstance = (unitsService as any).unitAssignmentModel;

      unitModelInstance.findById.mockResolvedValue({
        id: unitId,
        facility_id: facilityId,
      });

      assignmentModelInstance.findByUnitAndTenant.mockResolvedValue(null);
      assignmentModelInstance.create.mockResolvedValue({ id: 'assignment-1' });

      // Execute with all metadata
      await unitsService.assignTenant(unitId, tenantId, {
        performedBy: 'user-123',
        source: 'fms_sync',
        syncLogId: 'sync-456',
        accessType: 'temporary',
        notes: 'Test assignment',
      });

      // Verify all metadata propagated
      expect(emittedEvents[0]).toMatchObject({
        unitId,
        tenantId,
        facilityId,
        accessType: 'temporary',
        metadata: {
          source: 'fms_sync',
          performedBy: 'user-123',
          syncLogId: 'sync-456',
        },
      });
    });
  });
});
