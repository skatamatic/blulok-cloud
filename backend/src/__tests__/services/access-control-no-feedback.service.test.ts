const mockUpdateAccessControlDevice = jest.fn();
const mockFindAccessControlDeviceWithGateway = jest.fn();
const mockFindOpenWindows = jest.fn().mockResolvedValue([]);

jest.mock('@/models/device.model', () => ({
  DeviceModel: jest.fn().mockImplementation(() => ({
    updateAccessControlDevice: mockUpdateAccessControlDevice,
    findAccessControlDeviceWithGateway: mockFindAccessControlDeviceWithGateway,
    findNoFeedbackAccessControlDevicesWithOpenWindow: mockFindOpenWindows,
  })),
}));

import { AccessControlNoFeedbackService } from '@/services/access-control-no-feedback.service';

describe('AccessControlNoFeedbackService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T20:00:00.000Z'));
    jest.clearAllMocks();
    mockUpdateAccessControlDevice.mockResolvedValue({});
    mockFindOpenWindows.mockResolvedValue([]);
    AccessControlNoFeedbackService.resetForTests();
  });

  afterEach(() => {
    AccessControlNoFeedbackService.resetForTests();
    jest.useRealTimers();
  });

  it('keeps timeout-zero devices logically locked', async () => {
    const service = AccessControlNoFeedbackService.getInstance();

    await service.applyAcceptedCommand({
      deviceId: 'ac-1',
      requestedStatus: 'unlocked',
      timeoutSec: 0,
    });

    expect(mockUpdateAccessControlDevice).toHaveBeenCalledWith('ac-1', {
      is_locked: true,
      no_feedback_unlock_until: null,
    });
  });

  it('marks open then relocks when the durable deadline passes', async () => {
    const service = AccessControlNoFeedbackService.getInstance();
    const unlockUntil = new Date('2026-07-15T20:00:30.000Z');
    mockFindAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'ac-1',
      has_lock_feedback: false,
      no_feedback_unlock_until: unlockUntil,
    });

    await service.applyAcceptedCommand({
      deviceId: 'ac-1',
      requestedStatus: 'unlocked',
      timeoutSec: 30,
    });

    expect(mockUpdateAccessControlDevice).toHaveBeenNthCalledWith(1, 'ac-1', {
      is_locked: false,
      no_feedback_unlock_until: unlockUntil,
    });

    await jest.advanceTimersByTimeAsync(30_000);

    expect(mockUpdateAccessControlDevice).toHaveBeenNthCalledWith(2, 'ac-1', {
      is_locked: true,
      no_feedback_unlock_until: null,
    });
  });

  it('re-arms persisted open windows during startup', async () => {
    const unlockUntil = new Date('2026-07-15T20:00:10.000Z');
    mockFindOpenWindows.mockResolvedValue([
      {
        id: 'ac-1',
        has_lock_feedback: false,
        no_feedback_unlock_until: unlockUntil,
      },
    ]);
    mockFindAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'ac-1',
      has_lock_feedback: false,
      no_feedback_unlock_until: unlockUntil,
    });

    const service = AccessControlNoFeedbackService.getInstance();
    await service.start();
    await jest.advanceTimersByTimeAsync(10_000);

    expect(mockUpdateAccessControlDevice).toHaveBeenCalledWith('ac-1', {
      is_locked: true,
      no_feedback_unlock_until: null,
    });
  });

  it('settles when the timer fires even if DB unlock_until still looks in the future', async () => {
    const service = AccessControlNoFeedbackService.getInstance();
    mockFindAccessControlDeviceWithGateway.mockResolvedValue({
      id: 'ac-1',
      has_lock_feedback: false,
      // Simulate MySQL/JS timezone skew making the deadline appear ~1h ahead
      no_feedback_unlock_until: new Date('2026-07-15T21:00:00.000Z'),
    });

    await service.applyAcceptedCommand({
      deviceId: 'ac-1',
      requestedStatus: 'unlocked',
      timeoutSec: 30,
    });

    await jest.advanceTimersByTimeAsync(30_000);

    expect(mockUpdateAccessControlDevice).toHaveBeenNthCalledWith(2, 'ac-1', {
      is_locked: true,
      no_feedback_unlock_until: null,
    });
  });
});
