import { ActivityEventsService } from '@/services/events/activity-events.service';
import { NotificationEventsService } from '@/services/events/notification-events.service';

describe('ActivityEventsService', () => {
  let service: ActivityEventsService;

  beforeEach(() => {
    service = ActivityEventsService.getInstance();
    service.removeAllListeners();
  });

  afterEach(() => {
    service.removeAllListeners();
  });

  const baseEvent = {
    activityId: 'act-1',
    entityType: 'device' as const,
    entityId: 'dev-1',
    title: 'Unlocked',
    actorType: 'user' as const,
    actorId: 'user-1',
    result: 'success' as const,
    occurredAt: new Date('2026-06-01T12:00:00.000Z'),
  };

  it('routes lock/unlock activities to lock channel and stamps timestamp', async () => {
    const onLogged = jest.fn();
    const onLock = jest.fn();
    const onAccess = jest.fn();
    service.onActivityLogged(onLogged);
    service.onLockActivity(onLock);
    service.onAccessActivity(onAccess);

    service.emitActivityLogged({
      ...baseEvent,
      activityType: 'unlock',
    });

    await Promise.resolve();
    expect(onLogged).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'unlock',
        timestamp: expect.any(Date),
      }),
    );
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onAccess).not.toHaveBeenCalled();
  });

  it('fans out facility/unit/device scoped listeners', async () => {
    const onFacility = jest.fn();
    const onUnit = jest.fn();
    const onDevice = jest.fn();
    const onOtherFacility = jest.fn();
    service.onFacilityActivity('fac-1', onFacility);
    service.onUnitActivity('unit-1', onUnit);
    service.onDeviceActivity('dev-1', onDevice);
    service.onFacilityActivity('fac-other', onOtherFacility);

    service.emitActivityLogged({
      ...baseEvent,
      activityType: 'access_attempt',
      facilityId: 'fac-1',
      unitId: 'unit-1',
      deviceId: 'dev-1',
    });

    await Promise.resolve();
    expect(onFacility).toHaveBeenCalledTimes(1);
    expect(onUnit).toHaveBeenCalledTimes(1);
    expect(onDevice).toHaveBeenCalledTimes(1);
    expect(onOtherFacility).not.toHaveBeenCalled();
  });

  it('isolates handler failures so other listeners still run', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    const succeeding = jest.fn();
    service.onActivityLogged(failing);
    service.onActivityLogged(succeeding);

    service.emitActivityLogged({
      ...baseEvent,
      activityType: 'status_change',
    });

    await new Promise((r) => setImmediate(r));
    expect(failing).toHaveBeenCalled();
    expect(succeeding).toHaveBeenCalled();
  });

  it('cleanup from onActivityLogged stops future deliveries', async () => {
    const handler = jest.fn();
    const cleanup = service.onActivityLogged(handler);
    cleanup();

    service.emitActivityLogged({
      ...baseEvent,
      activityType: 'error',
    });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('NotificationEventsService', () => {
  let service: NotificationEventsService;

  beforeEach(() => {
    service = NotificationEventsService.getInstance();
    service.removeAllListeners();
  });

  afterEach(() => {
    service.removeAllListeners();
  });

  it('emits created events on both created and changed channels', async () => {
    const onCreated = jest.fn();
    const onChanged = jest.fn();
    service.onNotificationCreated(onCreated);
    service.onNotificationChanged(onChanged);

    service.emitNotificationCreated({
      notificationId: 'n-1',
      userId: 'user-1',
      notificationType: 'unit_assigned',
      priority: 'high',
      title: 'Alert',
      message: 'Something happened',
      facilityId: 'fac-1',
    });

    await Promise.resolve();
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'created',
        notificationId: 'n-1',
        timestamp: expect.any(Date),
      }),
    );
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'created', notificationId: 'n-1' }),
    );
  });

  it('emits batch read with optional facility scope', async () => {
    const onBatch = jest.fn();
    service.onBatchRead(onBatch);

    service.emitBatchRead('user-1', ['n-1', 'n-2'], { facilityId: 'fac-1' });
    await Promise.resolve();

    expect(onBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        notificationIds: ['n-1', 'n-2'],
        facilityId: 'fac-1',
        timestamp: expect.any(Date),
      }),
    );
  });

  it('emits batch hidden and isolates throwing handlers', async () => {
    const failing = jest.fn().mockImplementation(() => {
      throw new Error('handler failed');
    });
    const succeeding = jest.fn();
    service.onBatchHidden(failing);
    service.onBatchHidden(succeeding);

    service.emitBatchHidden('user-1', { facilityIds: ['fac-1', 'fac-2'] });
    await new Promise((r) => setImmediate(r));

    expect(failing).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        facilityIds: ['fac-1', 'fac-2'],
      }),
    );
    expect(succeeding).toHaveBeenCalled();
  });
});
