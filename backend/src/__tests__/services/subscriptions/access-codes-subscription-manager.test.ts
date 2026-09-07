import { AccessCodesSubscriptionManager } from '@/services/subscriptions/access-codes-subscription-manager';
import { AccessCodeService } from '@/services/access-code.service';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

jest.mock('@/services/access-code.service');

const TEST_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_FACILITY_ID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const TEST_USER_ID = 'c47ac10b-58cc-4372-a567-0e02b2c3d479';

const openWs = () =>
  ({
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  }) as any;

describe('AccessCodesSubscriptionManager', () => {
  let manager: AccessCodesSubscriptionManager;
  let mockAccessCodeService: { getAppCodesForUser: jest.Mock };

  const mockCodes = [
    { facilityId: TEST_FACILITY_ID, code: '1234', unitNumber: 'A-101' },
  ];

  const adminClient = {
    userId: TEST_USER_ID,
    userRole: UserRole.ADMIN,
    subscriptions: new Map(),
    facilityIds: undefined as string[] | undefined,
  };

  const facilityAdminClient = {
    userId: TEST_USER_ID,
    userRole: UserRole.FACILITY_ADMIN,
    subscriptions: new Map(),
    facilityIds: [TEST_FACILITY_ID],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessCodeService = {
      getAppCodesForUser: jest.fn().mockResolvedValue(mockCodes),
    };
    (AccessCodeService.getInstance as jest.Mock).mockReturnValue(mockAccessCodeService);
    manager = new AccessCodesSubscriptionManager();
  });

  describe('getSubscriptionType / canSubscribe', () => {
    it('returns access_codes subscription type', () => {
      expect(manager.getSubscriptionType()).toBe('access_codes');
    });

    it('allows app read roles to subscribe', () => {
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(true);
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.BLULOK_TECHNICIAN)).toBe(false);
    });
  });

  describe('handleSubscription', () => {
    it('subscribes without facility filter and sends initial codes', async () => {
      const ws = openWs();

      const result = await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-1' },
        adminClient,
      );

      expect(result).toBe(true);
      expect(mockAccessCodeService.getAppCodesForUser).toHaveBeenCalledWith(
        TEST_USER_ID,
        UserRole.ADMIN,
        undefined,
        undefined,
      );
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.type).toBe('access_codes_update');
      expect(msg.data.codes).toEqual(mockCodes);
      expect(msg.data.count).toBe(1);
    });

    it('subscribes with facility_id and facilityId aliases', async () => {
      const ws = openWs();

      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'access_codes',
          subscriptionId: 'sub-fac',
          data: { facility_id: TEST_FACILITY_ID },
        },
        facilityAdminClient,
      );

      expect(mockAccessCodeService.getAppCodesForUser).toHaveBeenCalledWith(
        TEST_USER_ID,
        UserRole.FACILITY_ADMIN,
        [TEST_FACILITY_ID],
        TEST_FACILITY_ID,
      );
    });

    it('rejects invalid facility UUID', async () => {
      const ws = openWs();

      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'access_codes',
          data: { facilityId: 'not-a-uuid' },
        },
        adminClient,
      );

      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Invalid facility ID');
      expect(mockAccessCodeService.getAppCodesForUser).not.toHaveBeenCalled();
    });

    it('rejects unauthorized role', async () => {
      const ws = openWs();
      const techClient = {
        ...adminClient,
        userRole: UserRole.BLULOK_TECHNICIAN,
      };

      const result = await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes' },
        techClient,
      );

      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Access denied');
    });

    it('rejects facility the user cannot access', async () => {
      const ws = openWs();

      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'access_codes',
          data: { facilityId: TEST_FACILITY_ID_2 },
        },
        facilityAdminClient,
      );

      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('do not have access');
    });

    it('sends error when initial load fails', async () => {
      const ws = openWs();
      mockAccessCodeService.getAppCodesForUser.mockRejectedValue(new Error('db down'));

      const result = await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-err' },
        adminClient,
      );

      expect(result).toBe(true);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Failed to load initial access codes');
    });
  });

  describe('handleUnsubscription / cleanup', () => {
    it('requires subscription ID on unsubscription', () => {
      const ws = openWs();
      manager.handleUnsubscription(ws, { type: 'unsubscription' }, adminClient);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Subscription ID required');
    });

    it('removes watchers and filters on unsubscription', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-u' },
        adminClient,
      );

      manager.handleUnsubscription(
        ws,
        { type: 'unsubscription', subscriptionId: 'sub-u' },
        adminClient,
      );

      expect((manager as any).subscriptionFilters.has('sub-u')).toBe(false);
      expect((manager as any).watchers.has('sub-u')).toBe(false);
    });

    it('cleans up empty watcher sets on disconnect', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-c' },
        adminClient,
      );

      manager.cleanup(ws, adminClient);

      expect((manager as any).watchers.has('sub-c')).toBe(false);
      expect((manager as any).subscriptionFilters.has('sub-c')).toBe(false);
    });
  });

  describe('broadcastUpdate', () => {
    it('returns early when there are no watchers', async () => {
      await expect(manager.broadcastUpdate(TEST_FACILITY_ID)).resolves.toBeUndefined();
      expect(mockAccessCodeService.getAppCodesForUser).not.toHaveBeenCalled();
    });

    it('broadcasts to open watchers and skips closed sockets', async () => {
      const open = openWs();
      const closed = { send: jest.fn(), readyState: WebSocket.CLOSED } as any;

      await manager.handleSubscription(
        open,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-b' },
        adminClient,
      );
      (manager as any).watchers.get('sub-b').add(closed);
      open.send.mockClear();

      await manager.broadcastUpdate();

      expect(open.send).toHaveBeenCalled();
      expect(closed.send).not.toHaveBeenCalled();
      const msg = JSON.parse(open.send.mock.calls[0][0]);
      expect(msg.type).toBe('access_codes_update');
      expect(msg.data.count).toBe(1);
    });

    it('skips subscriptions scoped to a different facility', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'access_codes',
          subscriptionId: 'sub-scoped',
          data: { facilityId: TEST_FACILITY_ID },
        },
        facilityAdminClient,
      );
      ws.send.mockClear();
      mockAccessCodeService.getAppCodesForUser.mockClear();

      await manager.broadcastUpdate(TEST_FACILITY_ID_2);

      expect(ws.send).not.toHaveBeenCalled();
      expect(mockAccessCodeService.getAppCodesForUser).not.toHaveBeenCalled();
    });

    it('skips broadcast when client cannot access changed facility', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-all' },
        facilityAdminClient,
      );
      ws.send.mockClear();

      await manager.broadcastUpdate(TEST_FACILITY_ID_2);

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('caches payload across subscriptions for the same user/role/facility', async () => {
      const ws1 = openWs();
      const ws2 = openWs();
      const client2 = { ...adminClient, subscriptions: new Map() };

      await manager.handleSubscription(
        ws1,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-1' },
        adminClient,
      );
      await manager.handleSubscription(
        ws2,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-2' },
        client2,
      );
      mockAccessCodeService.getAppCodesForUser.mockClear();
      ws1.send.mockClear();
      ws2.send.mockClear();

      await manager.broadcastUpdate();

      expect(mockAccessCodeService.getAppCodesForUser).toHaveBeenCalledTimes(1);
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it('continues when payload build fails for a subscription', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-fail' },
        adminClient,
      );
      ws.send.mockClear();
      mockAccessCodeService.getAppCodesForUser.mockRejectedValueOnce(new Error('boom'));

      await expect(manager.broadcastUpdate()).resolves.toBeUndefined();
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('swallows send errors during broadcast', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'access_codes', subscriptionId: 'sub-send' },
        adminClient,
      );
      ws.send.mockClear();
      ws.send.mockImplementation(() => {
        throw new Error('send failed');
      });

      await expect(manager.broadcastUpdate()).resolves.toBeUndefined();
    });

    it('skips subscriptions missing client context', async () => {
      const ws = openWs();
      (manager as any).watchers.set('orphan', new Set([ws]));
      await manager.broadcastUpdate();
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
