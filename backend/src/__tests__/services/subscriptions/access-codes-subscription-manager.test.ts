import { AccessCodesSubscriptionManager } from '@/services/subscriptions/access-codes-subscription-manager';
import { AccessCodeService } from '@/services/access-code.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/access-code.service');

describe('AccessCodesSubscriptionManager', () => {
  let manager: AccessCodesSubscriptionManager;
  let mockAccessCodeService: jest.Mocked<AccessCodeService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccessCodeService = {
      getAppCodesForUser: jest.fn(),
    } as unknown as jest.Mocked<AccessCodeService>;
    (AccessCodeService.getInstance as jest.Mock).mockReturnValue(mockAccessCodeService);
    manager = new AccessCodesSubscriptionManager();
  });

  it('returns access_codes subscription type', () => {
    expect(manager.getSubscriptionType()).toBe('access_codes');
  });

  it('allows app read roles to subscribe', () => {
    expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
    expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(true);
    expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
    expect(manager.canSubscribe(UserRole.BLULOK_TECHNICIAN)).toBe(false);
  });
});
