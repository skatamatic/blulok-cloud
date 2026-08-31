/**
 * Account reset service — verifies wipe targets and preserved tables.
 */

const mockTrx: any = {
  schema: { hasTable: jest.fn().mockResolvedValue(true) },
  fn: { now: jest.fn().mockReturnValue('NOW') },
  raw: jest.fn((sql: string) => sql),
};

function chainable(result: any = []) {
  const c: any = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    pluck: jest.fn().mockResolvedValue(result),
    del: jest.fn().mockResolvedValue(1),
    update: jest.fn().mockResolvedValue(1),
  };
  return c;
}

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: () => ({
      connection: Object.assign(
        jest.fn((table: string) => {
          if (table === 'unit_assignments') return chainable(['unit-1']);
          if (table === 'user_devices') return chainable(['dev-1']);
          return chainable();
        }),
        {
          raw: jest.fn((sql: string) => sql),
          fn: { now: jest.fn().mockReturnValue('NOW') },
          schema: { hasTable: jest.fn().mockResolvedValue(true) },
          transaction: async (fn: (trx: any) => Promise<void>) => {
            const trx = Object.assign(
              (table: string) => {
                if (table === 'unit_assignments') return chainable(['unit-1']);
                if (table === 'user_devices') {
                  const c = chainable(['dev-1']);
                  return c;
                }
                if (table === 'users') return chainable();
                if (table === 'user_invites') return chainable();
                if (table === 'user_otps') return chainable();
                if (table === 'password_reset_tokens') return chainable();
                if (table === 'device_lock_associations') return chainable();
                return chainable();
              },
              mockTrx,
            );
            await fn(trx);
          },
        },
      ),
    }),
  },
}));

jest.mock('@/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
  },
}));

jest.mock('@/services/fms/fms-placeholder-user.utils', () => ({
  FMS_PLACEHOLDER_PASSWORD_HASH: 'HASH',
  isPlaceholderUser: jest.fn().mockReturnValue(false),
}));

jest.mock('@/models/denylist-entry.model', () => ({
  DenylistEntryModel: jest.fn().mockImplementation(() => ({
    bulkCreate: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/services/denylist.service', () => ({
  DenylistService: { buildDenylistAdd: jest.fn().mockResolvedValue('jwt') },
}));

jest.mock('@/services/denylist-optimization.service', () => ({
  DenylistOptimizationService: {
    shouldSkipDenylistAdd: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('@/services/access-control-zone-access.service', () => ({
  AccessControlZoneAccessService: {
    getDenylistTargetsForUserRevocation: jest.fn().mockResolvedValue([]),
    getDeviceFacilityIds: jest.fn().mockResolvedValue(new Map()),
  },
}));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: { getInstance: () => ({ unicastToFacility: jest.fn() }) },
}));

jest.mock('@/config/environment', () => ({
  config: { security: { routePassTtlHours: 24 } },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: () => ({ logActivity: jest.fn().mockResolvedValue({}) }),
  },
}));

const sendInvite = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/first-time-user.service', () => ({
  FirstTimeUserService: {
    getInstance: () => ({ sendInvite }),
  },
}));

jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn().mockResolvedValue(['fac-1']),
  },
}));

jest.mock('@/services/notifications/in-app-notification-dispatcher.service', () => ({
  InAppNotificationDispatcher: {
    getInstance: () => ({
      notifyUserAccountReset: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { UserModel } from '@/models/user.model';
import { AccountResetService } from '@/services/account-reset.service';

describe('AccountResetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      phone_number: null,
      first_name: 'Ada',
      last_name: 'Lovelace',
      is_placeholder: false,
    });
    sendInvite.mockResolvedValue({ delivered: ['email'], warning: undefined });
  });

  it('resets and re-invites a loginable user', async () => {
    const result = await AccountResetService.getInstance().resetAndReinvite('u1', {
      performedBy: 'admin-1',
      sendInvite: true,
    });
    expect(result.user.id).toBe('u1');
    expect(result.inviteSent).toBe(true);
    expect(sendInvite).toHaveBeenCalled();
  });

  it('skips invite when sendInvite is false', async () => {
    await AccountResetService.getInstance().resetAndReinvite('u1', {
      performedBy: 'admin-1',
      sendInvite: false,
    });
    expect(sendInvite).not.toHaveBeenCalled();
  });

  it('rejects missing, placeholder, and contactless users', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValueOnce(undefined);
    await expect(
      AccountResetService.getInstance().resetAndReinvite('missing', {
        performedBy: 'admin-1',
      }),
    ).rejects.toThrow('User not found');

    const { isPlaceholderUser } = jest.requireMock('@/services/fms/fms-placeholder-user.utils');
    (isPlaceholderUser as jest.Mock).mockReturnValueOnce(true);
    await expect(
      AccountResetService.getInstance().resetAndReinvite('u1', { performedBy: 'admin-1' }),
    ).rejects.toThrow(/placeholder/i);

    (isPlaceholderUser as jest.Mock).mockReturnValue(false);
    (UserModel.findById as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      email: null,
      phone_number: null,
    });
    await expect(
      AccountResetService.getInstance().resetAndReinvite('u1', { performedBy: 'admin-1' }),
    ).rejects.toThrow(/no email or phone/i);
  });

  it('surfaces invite delivery failures without failing the reset', async () => {
    sendInvite.mockResolvedValueOnce({ delivered: [], warning: undefined });
    const empty = await AccountResetService.getInstance().resetAndReinvite('u1', {
      performedBy: 'admin-1',
      sendInvite: true,
    });
    expect(empty.inviteSent).toBe(false);
    expect(empty.inviteWarning).toMatch(/no invite could be sent/i);

    sendInvite.mockRejectedValueOnce(new Error('smtp down'));
    const failed = await AccountResetService.getInstance().resetAndReinvite('u1', {
      performedBy: 'admin-1',
      sendInvite: true,
    });
    expect(failed.inviteSent).toBe(false);
    expect(failed.inviteWarning).toMatch(/could not be sent/i);
  });

  it('pushes denylist when optimization does not skip', async () => {
    const {
      AccessControlZoneAccessService,
    } = jest.requireMock('@/services/access-control-zone-access.service') as {
      AccessControlZoneAccessService: {
        getDenylistTargetsForUserRevocation: jest.Mock;
        getDeviceFacilityIds: jest.Mock;
      };
    };
    const { DenylistOptimizationService } = jest.requireMock(
      '@/services/denylist-optimization.service',
    ) as { DenylistOptimizationService: { shouldSkipDenylistAdd: jest.Mock } };
    const { DenylistService } = jest.requireMock('@/services/denylist.service') as {
      DenylistService: { buildDenylistAdd: jest.Mock };
    };
    const unicast = jest.fn();
    const { GatewayEventsService } = jest.requireMock(
      '@/services/gateway/gateway-events.service',
    ) as { GatewayEventsService: { getInstance: jest.Mock } };
    GatewayEventsService.getInstance = jest.fn(() => ({ unicastToFacility: unicast }));

    AccessControlZoneAccessService.getDenylistTargetsForUserRevocation.mockImplementation(
      async () => [{ device_id: 'dev-1', device_type: 'blulok' }],
    );
    DenylistOptimizationService.shouldSkipDenylistAdd.mockImplementation(async () => false);
    AccessControlZoneAccessService.getDeviceFacilityIds.mockImplementation(
      async () => new Map([['dev-1', 'fac-1']]),
    );
    DenylistService.buildDenylistAdd.mockImplementation(async () => 'jwt-token');

    await AccountResetService.getInstance().resetAndReinvite('u1', {
      performedBy: 'admin-1',
      sendInvite: false,
    });

    expect(DenylistService.buildDenylistAdd).toHaveBeenCalled();
    expect(unicast).toHaveBeenCalledWith('fac-1', 'jwt-token');
  });

  it('swallows activity and notification failures after a successful wipe', async () => {
    const { ActivityService } = jest.requireMock('@/services/activity.service') as {
      ActivityService: { getInstance: () => { logActivity: jest.Mock } };
    };
    ActivityService.getInstance = jest.fn(() => ({
      logActivity: jest.fn().mockRejectedValue(new Error('activity down')),
    }));

    const { InAppNotificationDispatcher } = jest.requireMock(
      '@/services/notifications/in-app-notification-dispatcher.service',
    ) as {
      InAppNotificationDispatcher: {
        getInstance: () => { notifyUserAccountReset: jest.Mock };
      };
    };
    InAppNotificationDispatcher.getInstance = jest.fn(() => ({
      notifyUserAccountReset: jest.fn().mockRejectedValue(new Error('notify down')),
    }));

    await expect(
      AccountResetService.getInstance().resetAndReinvite('u1', {
        performedBy: 'admin-1',
        sendInvite: false,
      }),
    ).resolves.toEqual(expect.objectContaining({ inviteSent: false }));
  });
});
