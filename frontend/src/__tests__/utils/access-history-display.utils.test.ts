/**
 * @jest-environment jsdom
 */
import { AccessLog } from '@/types/access-history.types';
import {
  buildAccessLogDetailItems,
  formatAccessAction,
  formatAccessMethod,
  getAccessFailureDetail,
  getAccessLocationDisplay,
  getAccessUserDisplay,
  isNonUserAccessActor,
} from '@/utils/access-history-display.utils';

const baseLog: AccessLog = {
  id: 'log-1',
  device_id: 'dev-1',
  device_type: 'blulok',
  facility_id: 'fac-1',
  unit_id: 'unit-1',
  user_id: undefined,
  action: 'lock',
  method: 'local_device',
  success: true,
  occurred_at: '2026-06-01T10:00:00.000Z',
  created_at: '2026-06-01T10:00:00.000Z',
  updated_at: '2026-06-01T10:00:00.000Z',
  facility_name: 'Petrolia Storage Facility',
  unit_number: 'A-101',
  user_name: 'Gateway',
  actor_type: 'gateway',
  device_name: 'Lock GW-123',
  device_serial: 'GW-123',
  metadata: {
    actor: { type: 'gateway', name: 'Gateway' },
    facility: { id: 'fac-1', name: 'Petrolia Storage Facility', navigation_url: '/facilities/fac-1' },
    device: { id: 'dev-1', name: 'Lock GW-123', navigation_url: '/devices/blulok/dev-1' },
  },
};

describe('access-history-display.utils', () => {
  it('shows em dash for local device events without a user', () => {
    const user = getAccessUserDisplay(baseLog);
    expect(user.primary).toBe('—');
    expect(user.secondary).toBeNull();
    expect(isNonUserAccessActor(baseLog)).toBe(true);
  });

  it('shows remote initiator for gateway commands', () => {
    const remoteLog: AccessLog = {
      ...baseLog,
      method: 'remote_gateway',
      user_id: 'user-1',
      user_name: 'Jane Admin',
      metadata: {
        initiated_by: {
          id: 'user-1',
          name: 'Jane Admin',
          navigation_url: '/users?highlight=user-1',
        },
        user: {
          id: 'user-1',
          name: 'Jane Admin',
          navigation_url: '/users?highlight=user-1',
        },
      },
    };
    const user = getAccessUserDisplay(remoteLog);
    expect(user.primary).toBe('Jane Admin');
  });

  it('labels unlock attempts and denial reasons', () => {
    const denied: AccessLog = {
      ...baseLog,
      action: 'unlock_attempt',
      success: false,
      denial_reason: 'out_of_schedule',
      metadata: { failure_summary: 'Out of schedule window' },
    };
    expect(formatAccessAction('unlock_attempt')).toBe('Unlock attempt denied');
    expect(formatAccessMethod('remote_gateway')).toBe('Remote via gateway');
    expect(getAccessFailureDetail(denied)).toBe('Out of schedule window');
  });

  it('hides facility in location primary when facility scoped', () => {
    const scoped = getAccessLocationDisplay(baseLog, { hideFacility: true });
    expect(scoped.primary).toBe('Unit A-101');
    expect(scoped.showFacilityLink).toBe(false);
  });

  it('builds expanded detail items with device link metadata', () => {
    const items = buildAccessLogDetailItems(baseLog, true);
    expect(items.some((item) => item.label === 'Device' && item.href)).toBe(true);
    expect(items.some((item) => item.label === 'Actor detail')).toBe(false);
  });
});
