import { InAppNotificationDispatcher } from '@/services/notifications/in-app-notification-dispatcher.service';
import { NotificationModel } from '@/models/notification.model';
import { InAppNotificationAudienceService } from '@/services/notifications/in-app-notification-audience.service';
import { NotificationService } from '@/services/notification.service';

jest.mock('@/models/notification.model');
jest.mock('@/services/notifications/in-app-notification-audience.service');
jest.mock('@/services/notification.service');

describe('InAppNotificationDispatcher', () => {
  const mockCreate = jest.fn().mockResolvedValue({});
  const mockHasRecentDuplicate = jest.fn().mockResolvedValue(false);
  const mockResolveFacility = jest.fn().mockResolvedValue(['user-1', 'user-2']);
  const mockResolveGlobal = jest.fn().mockResolvedValue(['admin-1']);
  const mockResolveDevAdmins = jest.fn().mockResolvedValue(['dev-admin-1']);

  beforeEach(() => {
    jest.clearAllMocks();
    (NotificationService.getInstance as jest.Mock).mockReturnValue({
      createNotification: mockCreate,
    });
    (NotificationModel as jest.Mock).mockImplementation(() => ({
      hasRecentDuplicate: mockHasRecentDuplicate,
    }));
    (InAppNotificationAudienceService.getInstance as jest.Mock).mockReturnValue({
      resolveFacilityOperators: mockResolveFacility,
      resolveGlobalOperators: mockResolveGlobal,
      resolveDevAdmins: mockResolveDevAdmins,
    });
  });

  it('dedupes gateway offline notifications per user', async () => {
    mockHasRecentDuplicate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const dispatcher = InAppNotificationDispatcher.getInstance();
    await dispatcher.notifyGatewayOffline('fac-1', 'gw-1', 'Gateway A');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('notifies dev admins only for backend errors', async () => {
    const dispatcher = InAppNotificationDispatcher.getInstance();
    await dispatcher.notifyBackendError('Critical', 'Something broke', { path: '/api/test' });
    expect(mockResolveDevAdmins).toHaveBeenCalled();
    expect(mockResolveGlobal).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'backend_error',
        userId: 'dev-admin-1',
        referenceId: '/api/test',
      }),
    );
  });

  it('hashes long API paths for backend_error referenceId (varchar 36)', async () => {
    const { createHash } = await import('crypto');
    const path = '/api/v1/users/0dcbd690-d60c-4383-9ecb-e3417e5f15aa/resend-invite';
    const expected = createHash('sha256').update(path).digest('hex').slice(0, 32);
    const dispatcher = InAppNotificationDispatcher.getInstance();
    await dispatcher.notifyBackendError('Critical', 'SMTP failed', { path });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: expected,
        metadata: expect.objectContaining({ path }),
      }),
    );
    expect(expected.length).toBeLessThanOrEqual(36);
  });

  it('fans out inventory duplicate serial alerts to facility operator roles', async () => {
    const dispatcher = InAppNotificationDispatcher.getInstance();
    await dispatcher.notifyDeviceInventorySyncError({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      syncLogId: 'log-1',
      deviceSerial: 'serial-abc',
      deviceKind: 'blulok',
      title: 'Duplicate lock serial blocked',
      message: 'Human readable message',
      priority: 'urgent',
    });

    expect(mockResolveFacility).toHaveBeenCalledWith('fac-1', {
      roles: expect.arrayContaining(['admin', 'dev_admin', 'facility_admin']),
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'device_inventory_sync_error',
        priority: 'urgent',
        referenceId: 'serial-abc',
      }),
    );
  });
});
