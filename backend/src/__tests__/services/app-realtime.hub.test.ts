import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { AppRealtimeHub } from '@/services/app-realtime.hub';
import { FacilityAccessService } from '@/services/facility-access.service';
import { NotificationModel } from '@/models/notification.model';
import { DeviceModel } from '@/models/device.model';
import { GatewayModel } from '@/models/gateway.model';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UnitsService } from '@/services/units.service';
import { AccessCodeService } from '@/services/access-code.service';
import { ActivityService } from '@/services/activity.service';
import { DeviceReachabilityEnrichmentService } from '@/services/device-reachability-enrichment.service';
import { NotificationEventsService } from '@/services/events/notification-events.service';
import { ActivityEventsService } from '@/services/events/activity-events.service';
import type { AppRealtimeClient } from '@/services/app-realtime.types';

jest.mock('@/services/facility-access.service', () => ({
  FacilityAccessService: {
    hasAccessToFacility: jest.fn(),
    getUserFacilityIds: jest.fn(),
  },
}));
function knexBuilder(rows: unknown[]) {
  const builder: any = {};
  const self = () => builder;
  builder.select = jest.fn(self);
  builder.join = jest.fn(self);
  builder.where = jest.fn((arg: unknown) => {
    if (typeof arg === 'function') arg(builder);
    return builder;
  });
  builder.whereNull = jest.fn(self);
  builder.orWhere = jest.fn(self);
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return builder;
}

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connection: jest.fn((table: string) => {
        if (String(table).includes('unit_assignments')) {
          return knexBuilder([{ unit_id: 'unit-a' }]);
        }
        return knexBuilder([]);
      }),
    }),
  },
}));
jest.mock('@/models/notification.model');
jest.mock('@/models/device.model');
jest.mock('@/models/gateway.model');
jest.mock('@/models/key-sharing.model');
jest.mock('@/services/units.service');
jest.mock('@/services/access-code.service');
jest.mock('@/services/activity.service');
jest.mock('@/services/device-reachability-enrichment.service');
jest.mock('@/services/events/notification-events.service');
jest.mock('@/services/events/activity-events.service');

describe('AppRealtimeHub', () => {
  let hub: AppRealtimeHub;
  let mockWs: jest.Mocked<WebSocket>;

  beforeEach(() => {
    const existing = (AppRealtimeHub as any).instance;
    if (existing?.destroy) existing.destroy();
    (AppRealtimeHub as any).instance = undefined;

    (NotificationEventsService.getInstance as jest.Mock).mockReturnValue({
      onNotificationCreated: jest.fn().mockReturnValue(() => {}),
      onNotificationRead: jest.fn().mockReturnValue(() => {}),
      onNotificationDeleted: jest.fn().mockReturnValue(() => {}),
      onBatchRead: jest.fn().mockReturnValue(() => {}),
      onBatchHidden: jest.fn().mockReturnValue(() => {}),
    });
    (ActivityEventsService.getInstance as jest.Mock).mockReturnValue({
      onActivityLogged: jest.fn().mockReturnValue(() => {}),
    });

    (NotificationModel as jest.Mock).mockImplementation(() => ({
      getUnreadCount: jest.fn().mockResolvedValue(2),
      find: jest.fn().mockResolvedValue([
        {
          id: 'n1',
          notification_type: 'unit_assigned',
          title: 'Unit assigned',
          message: 'msg',
          priority: 'normal',
          is_read: false,
          read_at: null,
          facility_id: 'facility-1',
          reference_type: 'unit',
          reference_id: 'unit-a',
          metadata: null,
          created_at: new Date(),
        },
      ]),
    }));

    (DeviceModel as jest.Mock).mockImplementation(() => ({
      findBluLokDevices: jest.fn().mockResolvedValue([
        {
          id: 'dev-own',
          unit_id: 'unit-a',
          facility_id: 'facility-1',
          lock_status: 'locked',
          device_status: 'online',
        },
        {
          id: 'dev-other',
          unit_id: 'unit-b',
          facility_id: 'facility-1',
          lock_status: 'locked',
          device_status: 'online',
        },
      ]),
      findAccessControlDevices: jest.fn().mockResolvedValue([
        {
          id: 'ac-1',
          facility_id: 'facility-1',
          name: 'Gate',
          is_locked: true,
          status: 'online',
        },
      ]),
      findBluLokDeviceById: jest.fn(),
      findAccessControlDeviceById: jest.fn(),
    }));

    (GatewayModel as jest.Mock).mockImplementation(() => ({
      findBoundGatewaysWithContext: jest.fn().mockResolvedValue([
        {
          id: 'gw-1',
          facility_id: 'facility-1',
          name: 'GW',
          status: 'online',
          last_seen: new Date(),
        },
      ]),
    }));

    (KeySharingModel as jest.Mock).mockImplementation(() => ({
      findAll: jest.fn().mockResolvedValue({ sharings: [], total: 0 }),
    }));

    (UnitsService.getInstance as jest.Mock).mockReturnValue({
      getUnits: jest.fn().mockResolvedValue({
        units: [{ id: 'unit-a', is_locked: true, status: 'occupied' }],
        total: 1,
      }),
    });

    (AccessCodeService.getInstance as jest.Mock).mockReturnValue({
      getAppCodesForUser: jest.fn().mockResolvedValue([]),
    });

    (ActivityService.getInstance as jest.Mock).mockReturnValue({
      getActivityLogs: jest.fn().mockResolvedValue({ activities: [], total: 0 }),
    });

    (DeviceReachabilityEnrichmentService.getInstance as jest.Mock).mockReturnValue({
      createLivenessCache: jest.fn().mockResolvedValue({}),
      enrichBluLokRow: jest.fn(async (d: any) => d),
      enrichAccessControlRow: jest.fn(async (d: any) => d),
    });

    hub = AppRealtimeHub.getInstance();
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    } as any;
  });

  afterEach(() => {
    hub.destroy();
    (AppRealtimeHub as any).instance = undefined;
    jest.clearAllMocks();
  });

  function tenantClient(): AppRealtimeClient {
    return {
      userId: 'tenant-1',
      userRole: UserRole.TENANT,
      facilityIds: ['facility-1'],
      lastClientHeartbeat: new Date(),
      heartbeatCount: 0,
    };
  }

  it('denies subscribe without facility access', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(false);
    const result = await hub.subscribe(mockWs, tenantClient(), 'facility-1', 'sub-1');
    expect(result).toEqual({ ok: false, error: 'Access denied to facility' });
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it('clears client subscription state when snapshot build fails', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    jest.spyOn(hub as any, 'buildSnapshot').mockRejectedValue(new Error('units boom'));
    const client = tenantClient();
    const result = await hub.subscribe(mockWs, client, 'facility-1', 'sub-1');
    expect(result).toEqual({ ok: false, error: 'Failed to load app snapshot' });
    expect(client.subscriptionId).toBeUndefined();
    expect(client.facilityId).toBeUndefined();
    expect(hub.getSubscriberCount()).toBe(0);
  });

  it('sends RBAC-scoped app_snapshot on subscribe for tenants', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);

    const result = await hub.subscribe(mockWs, tenantClient(), 'facility-1', 'sub-1');
    expect(result).toEqual({ ok: true });

    expect(mockWs.send).toHaveBeenCalled();
    const payload = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
    expect(payload.type).toBe('app_event');
    expect(payload.event).toBe('app_snapshot');
    expect(payload.facilityId).toBe('facility-1');
    expect(payload.data.notifications.unreadCount).toBe(2);

    const deviceIds = (payload.data.devices as Array<{ id: string }>).map((d) => d.id);
    expect(deviceIds).toContain('dev-own');
    expect(deviceIds).not.toContain('dev-other');
    expect(deviceIds).not.toContain('ac-1');
  });

  it('includes facility-level devices for facility admins', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    const client: AppRealtimeClient = {
      userId: 'fa-1',
      userRole: UserRole.FACILITY_ADMIN,
      facilityIds: ['facility-1'],
      lastClientHeartbeat: new Date(),
      heartbeatCount: 0,
    };

    const result = await hub.subscribe(mockWs, client, 'facility-1', 'sub-fa');
    expect(result).toEqual({ ok: true });
    const payload = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
    const deviceIds = (payload.data.devices as Array<{ id: string }>).map((d) => d.id);
    expect(deviceIds).toEqual(expect.arrayContaining(['dev-own', 'dev-other', 'ac-1']));
  });

  it('emitUnitsUpdate only notifies tenants for their accessible units', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    await hub.subscribe(mockWs, tenantClient(), 'facility-1', 'sub-1');
    (mockWs.send as jest.Mock).mockClear();

    await hub.emitUnitsUpdate({ facilityId: 'facility-1', unitId: 'unit-b' });
    expect(mockWs.send).not.toHaveBeenCalled();

    await hub.emitUnitsUpdate({ facilityId: 'facility-1', unitId: 'unit-a' });
    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
    expect(payload.event).toBe('units_update');
  });

  it('emitUnitsUpdate skips tenants for facility-wide refreshes', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    await hub.subscribe(mockWs, tenantClient(), 'facility-1', 'sub-1');
    (mockWs.send as jest.Mock).mockClear();

    await hub.emitUnitsUpdate({ facilityId: 'facility-1' });
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it('emitUnitsUpdate resolves unit from deviceId for tenant filtering', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    await hub.subscribe(mockWs, tenantClient(), 'facility-1', 'sub-1');
    (mockWs.send as jest.Mock).mockClear();

    const deviceModel = (hub as any).deviceModel;
    deviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
      id: 'dev-other',
      unit_id: 'unit-b',
      facility_id: 'facility-1',
    });

    await hub.emitUnitsUpdate({ deviceId: 'dev-other' });
    expect(mockWs.send).not.toHaveBeenCalled();

    deviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
      id: 'dev-own',
      unit_id: 'unit-a',
      facility_id: 'facility-1',
    });
    await hub.emitUnitsUpdate({ deviceId: 'dev-own' });
    expect(mockWs.send).toHaveBeenCalledTimes(1);
  });

  it('emitDeviceStatusUpdate fans out only to tenants for their unit devices', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    await hub.subscribe(mockWs, tenantClient(), 'facility-1', 'sub-1');
    (mockWs.send as jest.Mock).mockClear();

    const deviceModel = (hub as any).deviceModel;
    deviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
      id: 'dev-own',
      unit_id: 'unit-a',
      facility_id: 'facility-1',
      lock_status: 'unlocked',
      device_status: 'online',
    });

    await hub.emitDeviceStatusUpdate('dev-own');
    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
    expect(payload.event).toBe('device_status_update');
    expect(payload.data.updatedDeviceId).toBe('dev-own');
    expect(payload.data.devices[0].unit_id).toBe('unit-a');

    (mockWs.send as jest.Mock).mockClear();
    deviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
      id: 'dev-other',
      unit_id: 'unit-b',
      facility_id: 'facility-1',
      lock_status: 'locked',
      device_status: 'online',
    });
    await hub.emitDeviceStatusUpdate('dev-other');
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it('emitDeviceStatusUpdate delivers facility-level access-control devices to facility admins', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    const faClient: AppRealtimeClient = {
      userId: 'fa-1',
      userRole: UserRole.FACILITY_ADMIN,
      facilityIds: ['facility-1'],
      lastClientHeartbeat: new Date(),
      heartbeatCount: 0,
    };
    await hub.subscribe(mockWs, faClient, 'facility-1', 'sub-fa');
    (mockWs.send as jest.Mock).mockClear();

    const deviceModel = (hub as any).deviceModel;
    deviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue(null);
    deviceModel.findAccessControlDeviceById = jest.fn().mockResolvedValue({
      id: 'ac-1',
      facility_id: 'facility-1',
      name: 'Gate',
      is_locked: true,
      status: 'online',
    });

    await hub.emitDeviceStatusUpdate('ac-1');
    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
    expect(payload.event).toBe('device_status_update');
    expect(payload.data.devices[0].id).toBe('ac-1');
    expect(payload.data.devices[0].unit_id).toBeNull();
  });

  it('emitGatewayStatusUpdate ignores subscribers on other facilities', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    await hub.subscribe(mockWs, tenantClient(), 'facility-1', 'sub-1');
    (mockWs.send as jest.Mock).mockClear();

    await hub.emitGatewayStatusUpdate('facility-2');
    expect(mockWs.send).not.toHaveBeenCalled();

    await hub.emitGatewayStatusUpdate('facility-1');
    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
    expect(payload.event).toBe('gateway_status_update');
    expect(payload.data.gateways[0].id).toBe('gw-1');
  });

  it('emitKeySharingUpdate uses shared_with_user_id for maintenance clients', async () => {
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);
    const maintClient: AppRealtimeClient = {
      userId: 'maint-1',
      userRole: UserRole.MAINTENANCE,
      facilityIds: ['facility-1'],
      lastClientHeartbeat: new Date(),
      heartbeatCount: 0,
    };
    await hub.subscribe(mockWs, maintClient, 'facility-1', 'sub-m');
    (mockWs.send as jest.Mock).mockClear();

    const keySharingModel = (hub as any).keySharingModel;
    keySharingModel.findAll = jest.fn().mockResolvedValue({ sharings: [{ id: 'share-1' }], total: 1 });

    await hub.emitKeySharingUpdate('facility-1');
    expect(keySharingModel.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: true,
        facility_ids: ['facility-1'],
        shared_with_user_id: 'maint-1',
      }),
    );
    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
    expect(payload.event).toBe('key_sharing_update');
    expect(payload.data.total).toBe(1);
  });
});
