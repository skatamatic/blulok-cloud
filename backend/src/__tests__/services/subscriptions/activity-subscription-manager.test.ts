import { ActivitySubscriptionManager } from '@/services/subscriptions/activity-subscription-manager';
import { ActivityLogModel } from '@/models/activity-log.model';
import { ActivityEventsService } from '@/services/events/activity-events.service';
import { UnitModel } from '@/models/unit.model';
import { DeviceModel } from '@/models/device.model';
import { AccessEventScopeService } from '@/services/access/access-event-scope.service';
import { AccessHistoryReadService } from '@/services/access/access-history-read.service';
import { AccessSessionReadService } from '@/services/access/access-session-read.service';
import { AccessSessionEventsService } from '@/services/events/access-session-events.service';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

jest.mock('@/models/activity-log.model');
jest.mock('@/services/events/activity-events.service');
jest.mock('@/services/events/access-session-events.service');
jest.mock('@/services/access/access-session-read.service');
jest.mock('@/models/unit.model');
jest.mock('@/models/device.model');
jest.mock('@/services/access/access-event-scope.service');
jest.mock('@/services/access/access-history-read.service', () => ({
  AccessHistoryReadService: Object.assign(
    jest.fn().mockImplementation(() => ({
      findAccessRecordById: jest.fn().mockResolvedValue(null),
    })),
    {
      ACCESS_HISTORY_ACTIVITY_TYPES: ['access_attempt', 'lock', 'unlock'],
    },
  ),
}));

const TEST_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_FACILITY_ID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const TEST_UNIT_ID = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_UNIT_ID_2 = 'a47ac10b-58cc-4372-a567-0e02b2c3d480';
const TEST_DEVICE_ID = 'b47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_USER_ID = 'c47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_ACTIVITY_ID = 'd47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_SESSION_ID = 'e47ac10b-58cc-4372-a567-0e02b2c3d479';

const openWs = () =>
  ({
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  }) as any;

describe('ActivitySubscriptionManager', () => {
  let manager: ActivitySubscriptionManager;
  let mockActivityLogModel: { findWithContext: jest.Mock };
  let mockEventService: { onActivityLogged: jest.Mock };
  let mockUnitModel: { findById: jest.Mock };
  let mockDeviceModel: {
    findBluLokDeviceById: jest.Mock;
    findAccessControlDeviceWithGateway: jest.Mock;
  };
  let mockScopeService: { getTenantAccessibleUnitIds: jest.Mock };
  let mockAccessHistoryRead: { findAccessRecordById: jest.Mock };
  let mockSessionEventService: { onSessionUpsert: jest.Mock };
  let mockAccessSessionRead: { findSessionRecordById: jest.Mock };

  const mockActivityLog = {
    id: TEST_ACTIVITY_ID,
    entity_type: 'device' as const,
    entity_id: TEST_DEVICE_ID,
    activity_type: 'lock' as const,
    title: 'Device Locked',
    description: 'Device was locked',
    actor_type: 'user' as const,
    actor_id: TEST_USER_ID,
    actor_name: 'John Doe',
    result: 'success' as const,
    result_message: null,
    facility_id: TEST_FACILITY_ID,
    unit_id: TEST_UNIT_ID,
    device_id: TEST_DEVICE_ID,
    unit_number: 'A-101',
    device_serial: 'SN-12345',
    facility_name: 'Test Facility',
    metadata: { action: 'lock', method: 'app', denial_reason: 'other' },
    occurred_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  const facilityAdminClient = {
    userId: TEST_USER_ID,
    userRole: UserRole.FACILITY_ADMIN,
    subscriptions: new Map(),
    facilityIds: [TEST_FACILITY_ID],
  };

  const adminClient = {
    userId: TEST_USER_ID,
    userRole: UserRole.ADMIN,
    subscriptions: new Map(),
    facilityIds: undefined as string[] | undefined,
  };

  const tenantClient = {
    userId: TEST_USER_ID,
    userRole: UserRole.TENANT,
    subscriptions: new Map(),
    facilityIds: [TEST_FACILITY_ID],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockActivityLogModel = {
      findWithContext: jest.fn().mockResolvedValue([mockActivityLog]),
    };

    mockEventService = {
      onActivityLogged: jest.fn().mockReturnValue(() => {}),
    };

    mockUnitModel = {
      findById: jest.fn().mockResolvedValue({ id: TEST_UNIT_ID, facility_id: TEST_FACILITY_ID }),
    };

    mockDeviceModel = {
      findBluLokDeviceById: jest.fn().mockResolvedValue({ id: TEST_DEVICE_ID, facility_id: TEST_FACILITY_ID }),
      findAccessControlDeviceWithGateway: jest.fn().mockResolvedValue(null),
    };

    mockScopeService = {
      getTenantAccessibleUnitIds: jest.fn().mockResolvedValue([TEST_UNIT_ID]),
    };

    mockAccessHistoryRead = {
      findAccessRecordById: jest.fn().mockResolvedValue({ id: 'access-1' }),
    };

    mockSessionEventService = {
      onSessionUpsert: jest.fn().mockReturnValue(() => {}),
    };

    mockAccessSessionRead = {
      findSessionRecordById: jest.fn().mockResolvedValue({
        id: TEST_SESSION_ID,
        state: 'open',
        facility_id: TEST_FACILITY_ID,
        unit_id: TEST_UNIT_ID,
        unit_number: 'A-101',
        facility_name: 'Test Facility',
        device_serial: 'SN-12345',
      }),
    };

    (AccessSessionEventsService.getInstance as jest.Mock).mockReturnValue(mockSessionEventService);
    (AccessSessionReadService as jest.MockedClass<typeof AccessSessionReadService>).mockImplementation(
      () => mockAccessSessionRead as any,
    );

    (ActivityLogModel as jest.MockedClass<typeof ActivityLogModel>).mockImplementation(
      () => mockActivityLogModel as any,
    );
    (ActivityEventsService.getInstance as jest.Mock).mockReturnValue(mockEventService);
    (UnitModel as jest.MockedClass<typeof UnitModel>).mockImplementation(() => mockUnitModel as any);
    (DeviceModel as jest.MockedClass<typeof DeviceModel>).mockImplementation(() => mockDeviceModel as any);
    (AccessEventScopeService as jest.MockedClass<typeof AccessEventScopeService>).mockImplementation(
      () => mockScopeService as any,
    );
    (AccessHistoryReadService as jest.MockedClass<typeof AccessHistoryReadService>).mockImplementation(
      () => mockAccessHistoryRead as any,
    );
    (AccessHistoryReadService as any).ACCESS_HISTORY_ACTIVITY_TYPES = [
      'access_attempt',
      'lock',
      'unlock',
    ];

    manager = new ActivitySubscriptionManager();
  });

  describe('basics', () => {
    it('returns activity subscription type', () => {
      expect(manager.getSubscriptionType()).toBe('activity');
    });

    it('allows all roles to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
    });

    it('registers activity event listener on construction', () => {
      expect(mockEventService.onActivityLogged).toHaveBeenCalled();
    });

    it('destroy runs cleanup functions', () => {
      const cleanup = jest.fn();
      mockEventService.onActivityLogged.mockReturnValue(cleanup);
      const m = new ActivitySubscriptionManager();
      m.destroy();
      expect(cleanup).toHaveBeenCalled();
    });

    it('broadcastUpdate is a no-op', async () => {
      await expect(manager.broadcastUpdate()).resolves.toBeUndefined();
    });
  });

  describe('handleSubscription validation', () => {
    it('rejects invalid facility / unit / device UUID formats', async () => {
      const ws = openWs();

      expect(
        await manager.handleSubscription(
          ws,
          { type: 'subscription', subscriptionType: 'activity', data: { facilityId: 'bad' } },
          facilityAdminClient,
        ),
      ).toBe(false);

      expect(
        await manager.handleSubscription(
          ws,
          { type: 'subscription', subscriptionType: 'activity', data: { unitId: 'bad' } },
          facilityAdminClient,
        ),
      ).toBe(false);

      expect(
        await manager.handleSubscription(
          ws,
          { type: 'subscription', subscriptionType: 'activity', data: { deviceId: 'bad' } },
          facilityAdminClient,
        ),
      ).toBe(false);
    });

    it('rejects unauthorized facility', async () => {
      const ws = openWs();
      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { facilityId: TEST_FACILITY_ID },
        },
        { ...facilityAdminClient, facilityIds: [TEST_FACILITY_ID_2] },
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('facility');
    });

    it('rejects missing unit', async () => {
      const ws = openWs();
      mockUnitModel.findById.mockResolvedValue(null);
      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          subscriptionId: 'sub-unit-miss',
          data: { unitId: TEST_UNIT_ID },
        },
        facilityAdminClient,
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Unit not found');
    });

    it('rejects unit in inaccessible facility', async () => {
      const ws = openWs();
      mockUnitModel.findById.mockResolvedValue({ id: TEST_UNIT_ID, facility_id: TEST_FACILITY_ID_2 });
      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { unitId: TEST_UNIT_ID },
        },
        facilityAdminClient,
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('unit');
    });

    it('rejects tenant unit outside accessible scope', async () => {
      const ws = openWs();
      mockScopeService.getTenantAccessibleUnitIds.mockResolvedValue([TEST_UNIT_ID_2]);
      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { unitId: TEST_UNIT_ID },
        },
        tenantClient,
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('unit');
    });

    it('rejects missing device', async () => {
      const ws = openWs();
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue(null);
      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { deviceId: TEST_DEVICE_ID },
        },
        facilityAdminClient,
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Device not found');
    });

    it('rejects device in inaccessible facility', async () => {
      const ws = openWs();
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue({
        id: TEST_DEVICE_ID,
        facility_id: TEST_FACILITY_ID_2,
      });
      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          data: { deviceId: TEST_DEVICE_ID },
        },
        facilityAdminClient,
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('device');
    });

    it('allows access-control device when BluLok is missing', async () => {
      const ws = openWs();
      mockDeviceModel.findBluLokDeviceById.mockResolvedValue(null);
      mockDeviceModel.findAccessControlDeviceWithGateway.mockResolvedValue({
        id: TEST_DEVICE_ID,
        facility_id: TEST_FACILITY_ID,
      });

      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          subscriptionId: 'sub-ac',
          data: { deviceId: TEST_DEVICE_ID },
        },
        facilityAdminClient,
      );

      expect(result).toBe(true);
      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({ device_id: TEST_DEVICE_ID }),
      );
    });
  });

  describe('handleSubscription happy paths', () => {
    it('subscribes without filters and sends activity', async () => {
      const ws = openWs();
      const result = await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-1' },
        facilityAdminClient,
      );

      expect(result).toBe(true);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.type).toBe('activity_update');
      expect(msg.data.activities[0].activityType).toBe('lock');
      expect(msg.data.activities[0].actor.name).toBe('John Doe');
    });

    it('scopes facility admin without facility filter to facility_ids', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-fa' },
        facilityAdminClient,
      );

      expect(mockActivityLogModel.findWithContext).toHaveBeenCalledWith(
        expect.objectContaining({ facility_ids: [TEST_FACILITY_ID] }),
      );
    });

    it('stores tenant unit scope and filters initial activities', async () => {
      const ws = openWs();
      mockActivityLogModel.findWithContext.mockResolvedValue([
        mockActivityLog,
        { ...mockActivityLog, id: 'other', unit_id: TEST_UNIT_ID_2, actor_id: 'someone-else' },
      ]);

      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-tenant' },
        tenantClient,
      );

      expect(mockScopeService.getTenantAccessibleUnitIds).toHaveBeenCalledWith(TEST_USER_ID);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.activities).toHaveLength(1);
      expect(msg.data.activities[0].id).toBe(TEST_ACTIVITY_ID);
    });

    it('returns empty activities when tenant has no unit scope', async () => {
      const ws = openWs();
      mockScopeService.getTenantAccessibleUnitIds.mockResolvedValue([]);

      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-empty' },
        tenantClient,
      );

      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.activities).toEqual([]);
      expect(mockActivityLogModel.findWithContext).not.toHaveBeenCalled();
    });

    it('filters by action/method/denialReason metadata', async () => {
      const ws = openWs();
      mockActivityLogModel.findWithContext.mockResolvedValue([
        mockActivityLog,
        { ...mockActivityLog, id: 'x', metadata: { action: 'unlock', method: 'keypad', denial_reason: 'timeout' } },
      ]);

      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'activity',
          subscriptionId: 'sub-meta',
          data: { action: 'lock', method: 'app', denialReason: 'other' },
        },
        adminClient,
      );

      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.activities).toHaveLength(1);
      expect(msg.data.activities[0].id).toBe(TEST_ACTIVITY_ID);
    });

    it('sends error when initial load fails', async () => {
      const ws = openWs();
      mockActivityLogModel.findWithContext.mockRejectedValue(new Error('db'));
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-err' },
        adminClient,
      );
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Failed to load initial activity data');
    });

    it('only returns own events for maintenance role', async () => {
      const ws = openWs();
      const maintenanceClient = {
        userId: TEST_USER_ID,
        userRole: UserRole.MAINTENANCE,
        subscriptions: new Map(),
        facilityIds: [TEST_FACILITY_ID],
      };
      mockActivityLogModel.findWithContext.mockResolvedValue([
        mockActivityLog,
        { ...mockActivityLog, id: 'other', actor_id: 'someone-else' },
      ]);

      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-maint' },
        maintenanceClient,
      );

      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.activities).toHaveLength(1);
      expect(msg.data.activities[0].id).toBe(TEST_ACTIVITY_ID);
    });
  });

  describe('handleUnsubscription / cleanup', () => {
    it('requires subscription ID', () => {
      const ws = openWs();
      manager.handleUnsubscription(ws, { type: 'unsubscription' }, facilityAdminClient);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Subscription ID required');
    });

    it('removes subscription state', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-u' },
        facilityAdminClient,
      );
      manager.handleUnsubscription(
        ws,
        { type: 'unsubscription', subscriptionId: 'sub-u' },
        facilityAdminClient,
      );
      expect((manager as any).subscriptionFilters.has('sub-u')).toBe(false);
      expect((manager as any).tenantUnitScopes.has('sub-u')).toBe(false);
    });

    it('cleanup removes empty watcher sets', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: 'sub-c' },
        facilityAdminClient,
      );
      manager.cleanup(ws, facilityAdminClient);
      expect((manager as any).watchers.has('sub-c')).toBe(false);
    });
  });

  describe('broadcastActivity via event listener', () => {
    const baseEvent = () => ({
      activityId: TEST_ACTIVITY_ID,
      entityType: 'device',
      entityId: TEST_DEVICE_ID,
      activityType: 'lock',
      title: 'Locked',
      description: 'Device was locked via app',
      actorType: 'user',
      actorId: TEST_USER_ID,
      actorName: 'John',
      result: 'success',
      facilityId: TEST_FACILITY_ID,
      unitId: TEST_UNIT_ID,
      deviceId: TEST_DEVICE_ID,
      occurredAt: new Date('2025-01-01T00:00:00Z'),
      timestamp: new Date('2025-01-01T00:00:01Z'),
    });

    async function subscribe(ws: any, client: any, data: any = {}, id = 'sub-live') {
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: id, data },
        client,
      );
      ws.send.mockClear();
    }

    it('returns early with no watchers', async () => {
      const handler = mockEventService.onActivityLogged.mock.calls[0][0];
      await handler(baseEvent());
      expect(mockAccessHistoryRead.findAccessRecordById).not.toHaveBeenCalled();
    });

    it('broadcasts activity_new to matching subscription', async () => {
      const ws = openWs();
      await subscribe(ws, adminClient);

      const handler = mockEventService.onActivityLogged.mock.calls[0][0];
      await handler(baseEvent());

      expect(mockAccessHistoryRead.findAccessRecordById).toHaveBeenCalledWith(TEST_ACTIVITY_ID);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.type).toBe('activity_new');
      expect(msg.data.activity.id).toBe(TEST_ACTIVITY_ID);
      expect(msg.data.accessLog).toEqual({ id: 'access-1' });
    });

    it('skips non-live activity types', async () => {
      const ws = openWs();
      await subscribe(ws, adminClient);
      const handler = mockEventService.onActivityLogged.mock.calls[0][0];
      await handler({ ...baseEvent(), activityType: 'notification' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('applies facility/unit/device filters', async () => {
      const ws = openWs();
      await subscribe(
        ws,
        adminClient,
        { facilityId: TEST_FACILITY_ID, unitId: TEST_UNIT_ID, deviceId: TEST_DEVICE_ID },
        'sub-f',
      );
      const handler = mockEventService.onActivityLogged.mock.calls[0][0];

      await handler({ ...baseEvent(), facilityId: TEST_FACILITY_ID_2 });
      expect(ws.send).not.toHaveBeenCalled();

      await handler({ ...baseEvent(), unitId: TEST_UNIT_ID_2 });
      expect(ws.send).not.toHaveBeenCalled();

      await handler({ ...baseEvent(), deviceId: 'b47ac10b-58cc-4372-a567-0e02b2c3d480' });
      expect(ws.send).not.toHaveBeenCalled();

      await handler(baseEvent());
      expect(ws.send).toHaveBeenCalled();
    });

    it('skips facility-admin events outside their facilities', async () => {
      const ws = openWs();
      await subscribe(ws, facilityAdminClient, {}, 'sub-fa-live');
      const handler = mockEventService.onActivityLogged.mock.calls[0][0];
      await handler({ ...baseEvent(), facilityId: TEST_FACILITY_ID_2 });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('skips tenant events outside unit scope unless own actor', async () => {
      const ws = openWs();
      await subscribe(ws, tenantClient, {}, 'sub-t-live');
      const handler = mockEventService.onActivityLogged.mock.calls[0][0];

      await handler({
        ...baseEvent(),
        unitId: TEST_UNIT_ID_2,
        actorId: 'other-user',
      });
      expect(ws.send).not.toHaveBeenCalled();

      await handler({
        ...baseEvent(),
        unitId: TEST_UNIT_ID_2,
        actorId: TEST_USER_ID,
      });
      expect(ws.send).toHaveBeenCalled();
    });

    it('applies action description filter when set', async () => {
      const ws = openWs();
      await subscribe(ws, adminClient, { action: 'unlock' }, 'sub-action');
      const handler = mockEventService.onActivityLogged.mock.calls[0][0];
      await handler(baseEvent());
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('does not send to closed sockets and swallows send errors', async () => {
      const open = openWs();
      const closed = { send: jest.fn(), readyState: WebSocket.CLOSED } as any;
      const bad = {
        send: jest.fn(() => {
          throw new Error('boom');
        }),
        readyState: WebSocket.OPEN,
      } as any;

      await subscribe(open, adminClient, {}, 'sub-ws');
      (manager as any).watchers.get('sub-ws').add(closed);
      (manager as any).watchers.get('sub-ws').add(bad);

      const handler = mockEventService.onActivityLogged.mock.calls[0][0];
      await expect(handler(baseEvent())).resolves.toBeUndefined();
      expect(closed.send).not.toHaveBeenCalled();
      expect(open.send).toHaveBeenCalled();
    });
  });

  describe('broadcastSessionUpsert via event listener', () => {
    const sessionEvent = (overrides: Record<string, unknown> = {}) => ({
      sessionId: TEST_SESSION_ID,
      facilityId: TEST_FACILITY_ID,
      unitId: TEST_UNIT_ID,
      deviceId: TEST_DEVICE_ID,
      state: 'open',
      changed: ['state', 'opened_at'],
      session: {
        id: TEST_SESSION_ID,
        actor_id: TEST_USER_ID,
        unit_id: TEST_UNIT_ID,
        facility_id: TEST_FACILITY_ID,
      },
      timestamp: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    });

    const sessionHandler = () => mockSessionEventService.onSessionUpsert.mock.calls[0][0];

    async function subscribe(ws: any, client: any, data: any = {}, id = 'sub-session') {
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'activity', subscriptionId: id, data },
        client,
      );
      ws.send.mockClear();
    }

    it('registers a session upsert listener on construction', () => {
      expect(mockSessionEventService.onSessionUpsert).toHaveBeenCalled();
    });

    it('does not read the session when there are no watchers', async () => {
      await sessionHandler()(sessionEvent());
      expect(mockAccessSessionRead.findSessionRecordById).not.toHaveBeenCalled();
    });

    it('does not read the session when no subscription matches the event', async () => {
      const ws = openWs();
      await subscribe(ws, adminClient, { facilityId: TEST_FACILITY_ID_2 }, 'sub-other-facility');

      await sessionHandler()(sessionEvent());

      expect(mockAccessSessionRead.findSessionRecordById).not.toHaveBeenCalled();
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('broadcasts the join-enriched record with changed fields', async () => {
      const ws = openWs();
      await subscribe(ws, adminClient);

      await sessionHandler()(sessionEvent());

      expect(mockAccessSessionRead.findSessionRecordById).toHaveBeenCalledWith(TEST_SESSION_ID);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.type).toBe('access_session_upsert');
      expect(msg.data.session).toEqual(
        expect.objectContaining({ id: TEST_SESSION_ID, unit_number: 'A-101', device_serial: 'SN-12345' }),
      );
      expect(msg.data.changed).toEqual(['state', 'opened_at']);
      expect(msg.data.timestamp).toBe('2026-01-01T00:00:00.000Z');
    });

    it('reads the session once when several subscriptions match the same event', async () => {
      await subscribe(openWs(), adminClient, {}, 'sub-a');
      await subscribe(openWs(), adminClient, {}, 'sub-b');

      await sessionHandler()(sessionEvent());

      expect(mockAccessSessionRead.findSessionRecordById).toHaveBeenCalledTimes(1);
    });

    it('sends session: null when the row is gone so clients refetch', async () => {
      const ws = openWs();
      await subscribe(ws, adminClient);
      mockAccessSessionRead.findSessionRecordById.mockResolvedValue(null);

      await sessionHandler()(sessionEvent());

      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.type).toBe('access_session_upsert');
      expect(msg.data.session).toBeNull();
    });

    it('skips tenants outside the unit scope unless they are the actor', async () => {
      const ws = openWs();
      await subscribe(ws, tenantClient, {}, 'sub-tenant-session');

      await sessionHandler()(
        sessionEvent({
          unitId: TEST_UNIT_ID_2,
          session: { id: TEST_SESSION_ID, actor_id: 'someone-else', unit_id: TEST_UNIT_ID_2 },
        }),
      );
      expect(ws.send).not.toHaveBeenCalled();

      await sessionHandler()(
        sessionEvent({
          unitId: TEST_UNIT_ID_2,
          session: { id: TEST_SESSION_ID, actor_id: TEST_USER_ID, unit_id: TEST_UNIT_ID_2 },
        }),
      );
      expect(ws.send).toHaveBeenCalled();
    });

    it('skips facility admins for events outside their facilities', async () => {
      const ws = openWs();
      await subscribe(ws, facilityAdminClient, {}, 'sub-fa-session');

      await sessionHandler()(sessionEvent({ facilityId: TEST_FACILITY_ID_2 }));

      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
