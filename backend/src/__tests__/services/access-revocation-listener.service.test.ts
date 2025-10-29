import { AccessRevocationListenerService } from '@/services/access-revocation-listener.service';

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn().mockReturnValue({
      unicastToFacility: jest.fn(),
      broadcast: jest.fn(),
    }),
  },
}));

jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    buildDenylistAdd: jest.fn().mockResolvedValue([{ cmd_type: 'DENYLIST_ADD' }, 'sig']),
  },
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      connection: jest.fn((_table: string) => ({
        where: () => ({ select: () => Promise.resolve([{ id: 'dev-123' }, { id: 'dev-999' }]) }),
      })),
    }),
  },
}));

const mockHandlers: any = {};
jest.mock('@/services/events/unit-assignment-events.service', () => ({
  UnitAssignmentEventsService: {
    getInstance: jest.fn().mockReturnValue({
      onTenantUnassigned: (h: any) => { mockHandlers.unassigned = h; },
    }),
  },
}));

describe('AccessRevocationListenerService', () => {
  it('registers unassignment handler and pushes device-targeted denylist', async () => {
    AccessRevocationListenerService.getInstance();
    // simulate event trigger
    // directly invoke captured handler
    await mockHandlers.unassigned({ tenantId: 'user-1', unitId: 'unit-1', facilityId: 'fac-1' });
    const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
    const gw = GatewayEventsService.getInstance() as any;
    expect(gw.unicastToFacility).toHaveBeenCalled();
  });
});


