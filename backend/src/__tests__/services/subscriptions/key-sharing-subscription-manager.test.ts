import { KeySharingSubscriptionManager } from '@/services/subscriptions/key-sharing-subscription-manager';
import { KeySharingModel } from '@/models/key-sharing.model';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/key-sharing.model');
jest.mock('@/services/auth.service', () => ({
  AuthService: {
    isAdmin: jest.fn(),
    isFacilityAdmin: jest.fn(),
    canAccessAllFacilities: jest.fn(),
  },
}));

const TEST_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_USER_ID = 'c47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('KeySharingSubscriptionManager', () => {
  let manager: KeySharingSubscriptionManager;
  let mockKeySharingModel: jest.Mocked<KeySharingModel>;
  let mockWs: { send: jest.Mock; readyState: number };

  const mockClient = {
    userId: TEST_USER_ID,
    userRole: UserRole.FACILITY_ADMIN,
    subscriptions: new Map(),
    facilityIds: [TEST_FACILITY_ID],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWs = { send: jest.fn(), readyState: 1 };
    mockKeySharingModel = {
      findAll: jest.fn().mockResolvedValue({ sharings: [], total: 0 }),
    } as unknown as jest.Mocked<KeySharingModel>;
    (KeySharingModel as jest.Mock).mockImplementation(() => mockKeySharingModel);
    (AuthService.isAdmin as jest.Mock).mockReturnValue(false);
    (AuthService.isFacilityAdmin as jest.Mock).mockReturnValue(true);
    (AuthService.canAccessAllFacilities as jest.Mock).mockReturnValue(false);
    manager = new KeySharingSubscriptionManager();
  });

  it('returns key_sharing subscription type', () => {
    expect(manager.getSubscriptionType()).toBe('key_sharing');
  });

  it('allows key-sharing read roles to subscribe', () => {
    expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
    expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(true);
    expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
    expect(manager.canSubscribe(UserRole.BLULOK_TECHNICIAN)).toBe(false);
  });

  it('rejects invalid facility id on subscribe', async () => {
    const result = await manager.handleSubscription(
      mockWs as any,
      { type: 'subscription', data: { facility_id: 'not-a-uuid' } },
      mockClient as any
    );
    expect(result).toBe(false);
    expect(mockWs.send).toHaveBeenCalled();
  });

  it('subscribes and sends initial key_sharing_update payload', async () => {
    const result = await manager.handleSubscription(
      mockWs as any,
      {
        type: 'subscription',
        subscriptionId: 'ks-1',
        data: { facility_id: TEST_FACILITY_ID },
      },
      mockClient as any
    );

    expect(result).toBe(true);
    expect(mockKeySharingModel.findAll).toHaveBeenCalled();
    expect(mockWs.send).toHaveBeenCalled();
    const payload = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(payload.type).toBe('key_sharing_update');
    expect(payload.subscriptionId).toBe('ks-1');
  });

  it('denies facility access when user cannot access facility', async () => {
    const result = await manager.handleSubscription(
      mockWs as any,
      {
        type: 'subscription',
        data: { facility_id: 'a47ac10b-58cc-4372-a567-0e02b2c3d479' },
      },
      mockClient as any
    );
    expect(result).toBe(false);
  });

  it('broadcastUpdate sends to active watchers', async () => {
    await manager.handleSubscription(
      mockWs as any,
      { type: 'subscription', subscriptionId: 'ks-broadcast' },
      mockClient as any
    );

    await manager.broadcastUpdate(TEST_FACILITY_ID);
    expect(mockWs.send).toHaveBeenCalledTimes(2);
  });

  it('handleUnsubscription requires subscription id', () => {
    manager.handleUnsubscription(mockWs as any, { type: 'unsubscription' }, mockClient as any);
    expect(mockWs.send).toHaveBeenCalled();
  });

  it('cleanup removes watcher state', async () => {
    await manager.handleSubscription(
      mockWs as any,
      { type: 'subscription', subscriptionId: 'ks-clean' },
      mockClient as any
    );
    manager.cleanup(mockWs as any, mockClient as any);
    await manager.broadcastUpdate();
    expect(mockWs.send).toHaveBeenCalledTimes(1);
  });
});
