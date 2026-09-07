const dbMock = jest.fn();
const forceRotate = jest.fn();
const getGroupConfig = jest.fn();
const isGatewayOnline = jest.fn();

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: dbMock })),
  },
}));

const flushPendingPushForFacility = jest.fn().mockResolvedValue(undefined);
const processDueOutboxPushes = jest.fn().mockResolvedValue(undefined);
let connectionChangeListener: ((event: {
  facilityId: string;
  connected: boolean;
  reason?: string;
  atMs?: number;
}) => void) | undefined;

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      getConnectedFacilityIds: jest.fn(() => []),
      onFacilityConnectionChange: jest.fn((listener: typeof connectionChangeListener) => {
        connectionChangeListener = listener;
        return jest.fn();
      }),
    })),
  },
}));

jest.mock('@/services/access-code.service', () => ({
  AccessCodeService: {
    getInstance: jest.fn(() => ({
      forceRotate,
      getGroupConfig,
      isGatewayOnline,
      flushPendingPushForFacility,
      processDueOutboxPushes,
    })),
  },
}));

import { AccessCodeSchedulerService } from '@/services/access-code-scheduler.service';

const makeGroupsQuery = (groupRows: Array<{ id: string; facility_id: string }>) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue(groupRows),
});

describe('AccessCodeSchedulerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectionChangeListener = undefined;
    isGatewayOnline.mockReturnValue(true);
    AccessCodeSchedulerService.resetForTests();
  });

  afterEach(() => {
    AccessCodeSchedulerService.resetForTests();
  });

  it('rotates due access-code groups on run', async () => {
    const groupRows = [
      {
        id: 'grp-1',
        facility_id: 'fac-1',
      },
    ];
    const groupsQuery = makeGroupsQuery(groupRows);
    getGroupConfig.mockResolvedValue({
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    });
    const latestCodeQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return groupsQuery;
      if (table === 'access_codes') return latestCodeQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    const scheduler = AccessCodeSchedulerService.getInstance();
    await (scheduler as any).run();

    expect(forceRotate).toHaveBeenCalledWith('fac-1', 'device_group', 'grp-1');
  });

  it('respects fractional interval before re-running same group', async () => {
    const groupRows = [
      {
        id: 'grp-1',
        facility_id: 'fac-1',
      },
    ];
    const groupsQuery = makeGroupsQuery(groupRows);
    getGroupConfig.mockResolvedValue({
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 0.0008,
      rotation_hour: 0,
      rotation_minute: 0,
    });
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return groupsQuery;
      if (table === 'access_codes') {
        return {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const scheduler = AccessCodeSchedulerService.getInstance();
    const now = Date.now();
    (scheduler as any).lastRunByGroup.set('grp-1', now - 1000); // 1s ago; interval ~= 2.88s

    await (scheduler as any).run();

    expect(forceRotate).not.toHaveBeenCalled();
  });

  it('shouldRotate returns false before anchor minute', () => {
    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    const now = new Date();
    now.setSeconds(0, 0);
    const anchor = new Date(now.getTime() + 60 * 1000);
    const due = scheduler.shouldRotate(
      now,
      {
        rotation_hour: anchor.getHours(),
        rotation_minute: anchor.getMinutes(),
        rotation_interval_hours: 1,
      },
      undefined,
    );
    expect(due).toBe(false);
  });

  it('shouldRotate honors exact interval threshold', () => {
    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    const now = new Date('2026-03-01T02:00:00.000Z');
    const oneHourAgo = new Date('2026-03-01T01:00:00.000Z').getTime();
    const due = scheduler.shouldRotate(
      now,
      {
        rotation_hour: 0,
        rotation_minute: 0,
        rotation_interval_hours: 1,
      },
      oneHourAgo,
    );
    expect(due).toBe(true);
  });

  it('schedules one-minute retry when push delivery fails', async () => {
    const groupRows = [{ id: 'grp-1', facility_id: 'fac-1' }];
    const groupsQuery = makeGroupsQuery(groupRows);
    const latestCodeQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return groupsQuery;
      if (table === 'access_codes') return latestCodeQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    getGroupConfig.mockResolvedValue({
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    });
    const pushErr = new Error('gateway offline');
    pushErr.name = 'AccessCodePushDeliveryError';
    forceRotate.mockRejectedValue(pushErr);

    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    await scheduler.run();

    expect(forceRotate).toHaveBeenCalledWith('fac-1', 'device_group', 'grp-1');
    const retryAt = scheduler.retryAtByGroup.get('grp-1');
    expect(typeof retryAt).toBe('number');
    expect(retryAt).toBeGreaterThan(Date.now());
    const firstDelay = retryAt - Date.now();
    expect(firstDelay).toBeLessThanOrEqual(60_000);
  });

  it('runSafe skips when a previous run is still in progress', async () => {
    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    scheduler.runInProgress = true;
    const runSpy = jest.spyOn(scheduler, 'run').mockResolvedValue(undefined);

    await scheduler.runSafe('scheduled run failed:');

    expect(runSpy).not.toHaveBeenCalled();
  });

  it('runSafe backs off after knex pool timeout', async () => {
    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    const timeoutError = new Error('Knex: Timeout acquiring a connection. The pool is probably full.');
    (timeoutError as any).name = 'KnexTimeoutError';
    const runSpy = jest.spyOn(scheduler, 'run').mockRejectedValue(timeoutError);

    await scheduler.runSafe('scheduled run failed:');
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(scheduler.nextRunNotBeforeMs).toBeGreaterThan(Date.now());

    await scheduler.runSafe('scheduled run failed:');
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it('rotates due groups while gateway is offline and queues push delivery', async () => {
    const groupRows = [{ id: 'grp-1', facility_id: 'fac-1' }];
    const groupsQuery = makeGroupsQuery(groupRows);
    const latestCodeQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return groupsQuery;
      if (table === 'access_codes') return latestCodeQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    getGroupConfig.mockResolvedValue({
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    });
    isGatewayOnline.mockReturnValue(false);
    forceRotate.mockResolvedValue(undefined);

    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    await scheduler.run();

    expect(forceRotate).toHaveBeenCalledWith('fac-1', 'device_group', 'grp-1');
    expect(scheduler.retryAtByGroup.get('grp-1')).toBeUndefined();
  });

  it('does not repeat offline rotation until interval elapses', async () => {
    const groupRows = [{ id: 'grp-1', facility_id: 'fac-1' }];
    const groupsQuery = makeGroupsQuery(groupRows);
    const latestCodeQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }),
    };
    dbMock.mockImplementation((table: string) => {
      if (table === 'device_groups') return groupsQuery;
      if (table === 'access_codes') return latestCodeQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    getGroupConfig.mockResolvedValue({
      is_enabled: true,
      digit_count: 6,
      rotation_interval_hours: 24,
      rotation_hour: 0,
      rotation_minute: 0,
    });
    isGatewayOnline.mockReturnValue(false);
    forceRotate.mockResolvedValue(undefined);

    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    await scheduler.run();

    await scheduler.run();
    expect(forceRotate).toHaveBeenCalledTimes(1);
    expect(scheduler.retryAtByGroup.get('grp-1')).toBeUndefined();
  });

  it('flushes outbox when gateway reconnects', async () => {
    const scheduler = AccessCodeSchedulerService.getInstance() as any;
    scheduler.start();
    flushPendingPushForFacility.mockClear();

    connectionChangeListener?.({
      facilityId: 'fac-1',
      connected: true,
      reason: 'auth_ok',
      atMs: Date.now(),
    });

    expect(flushPendingPushForFacility).toHaveBeenCalledWith('fac-1');
    scheduler.stop();
  });
});
