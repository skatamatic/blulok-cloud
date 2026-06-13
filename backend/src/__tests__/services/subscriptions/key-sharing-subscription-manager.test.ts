import { KeySharingSubscriptionManager } from '@/services/subscriptions/key-sharing-subscription-manager';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/key-sharing.model');

describe('KeySharingSubscriptionManager', () => {
  let manager: KeySharingSubscriptionManager;
  let mockKeySharingModel: jest.Mocked<KeySharingModel>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKeySharingModel = {
      findAll: jest.fn().mockResolvedValue({ sharings: [], total: 0 }),
    } as unknown as jest.Mocked<KeySharingModel>;
    (KeySharingModel as jest.Mock).mockImplementation(() => mockKeySharingModel);
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
});
