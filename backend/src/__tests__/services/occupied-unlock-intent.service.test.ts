import {
  OccupiedUnlockIntentService,
} from '@/services/occupied-unlock-intent.service';

describe('OccupiedUnlockIntentService', () => {
  beforeEach(() => {
    OccupiedUnlockIntentService.resetForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    OccupiedUnlockIntentService.resetForTests();
  });

  const baseParams = {
    userId: 'staff-1',
    userName: 'Staff',
    role: 'facility_admin',
    deviceId: 'dev-1',
    unitId: 'unit-1',
    facilityId: 'fac-1',
    override: {
      reason: 'emergency',
      reasonLabel: 'Emergency (Fire, flood, other)',
      notes: 'flood',
    },
  };

  it('creates and peeks a pending intent', () => {
    const svc = OccupiedUnlockIntentService.getInstance();
    const intent = svc.createIntent(baseParams);
    expect(intent.intentId).toBeTruthy();
    expect(svc.peekPending('dev-1')?.intentId).toBe(intent.intentId);
  });

  it('expires pending intents after TTL', () => {
    const svc = OccupiedUnlockIntentService.getInstance();
    svc.createIntent(baseParams);
    jest.advanceTimersByTime(61_000);
    expect(svc.peekPending('dev-1')).toBeNull();
  });

  it('rejects create when another user has a live intent', () => {
    const svc = OccupiedUnlockIntentService.getInstance();
    svc.createIntent(baseParams);
    expect(() =>
      svc.createIntent({ ...baseParams, userId: 'staff-2', userName: 'Other' }),
    ).toThrow('OCCUPIED_UNLOCK_INTENT_IN_USE');
  });

  it('consumes only for matching user and arms unlock-state window', () => {
    const svc = OccupiedUnlockIntentService.getInstance();
    const intent = svc.createIntent(baseParams);

    expect(
      svc.tryConsumeForAccessEvent({ deviceId: 'dev-1', userId: 'wrong' }),
    ).toBeNull();
    expect(svc.peekPending('dev-1')).not.toBeNull();

    const consumed = svc.tryConsumeForAccessEvent({
      deviceId: 'dev-1',
      userId: 'staff-1',
      intentIdFromMetadata: intent.intentId,
    });
    expect(consumed?.intentId).toBe(intent.intentId);
    expect(svc.peekPending('dev-1')).toBeNull();

    const state = svc.tryConsumeForUnlockState('dev-1');
    expect(state?.userId).toBe('staff-1');
    expect(state?.override.reason).toBe('emergency');
    expect(svc.tryConsumeForUnlockState('dev-1')).toBeNull();
  });

  it('rejects access-event consume when intent id metadata mismatches', () => {
    const svc = OccupiedUnlockIntentService.getInstance();
    svc.createIntent(baseParams);
    expect(
      svc.tryConsumeForAccessEvent({
        deviceId: 'dev-1',
        userId: 'staff-1',
        intentIdFromMetadata: 'other-id',
      }),
    ).toBeNull();
  });
});
