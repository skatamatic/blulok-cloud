/**
 * @jest-environment jsdom
 */
import { AccessLog } from '@/types/access-history.types';
import {
  buildAccessLogDetailItems,
  formatAccessAction,
  formatAccessHistoryDeviceLabel,
  formatAccessHistoryUnitLabel,
  formatAccessMethod,
  formatOccupiedUnlockOverrideSubtitle,
  getAccessActionIconTileClass,
  getAccessActionToneClass,
  getAccessFailureDetail,
  getAccessLocationDisplay,
  getAccessLogMetadata,
  getAccessLogUserLink,
  getAccessMethodToneClass,
  getAccessUserDisplay,
  getOccupiedUnlockOverrideReasonLabel,
  isNonUserAccessActor,
  partitionAccessLogDetailItems,
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

  it('labels keypad user links from metadata id and user_name when name is missing', () => {
    const keypadLog: AccessLog = {
      ...baseLog,
      method: 'keypad',
      actor_type: 'user',
      user_id: 'user-2',
      user_name: 'Taylor Morgan',
      metadata: {
        user: {
          id: 'user-2',
          name: '',
          navigation_url: '/users/user-2/details',
        },
      },
    };

    expect(getAccessUserDisplay(keypadLog).primary).toBe('Taylor Morgan');
    expect(getAccessLogUserLink(keypadLog)).toEqual({
      id: 'user-2',
      href: '/users/user-2/details',
      label: 'Taylor Morgan',
    });
  });

  it('falls back to email for linked users without a display name', () => {
    const emailLog: AccessLog = {
      ...baseLog,
      method: 'app',
      actor_type: 'user',
      user_id: 'user-3',
      user_name: undefined,
      user_email: 'tenant@example.com',
      metadata: {
        user: {
          id: 'user-3',
          name: '',
          email: 'tenant@example.com',
          navigation_url: '/users/user-3/details',
        },
      },
    };

    expect(getAccessUserDisplay(emailLog).primary).toBe('tenant@example.com');
    expect(getAccessLogUserLink(emailLog)?.label).toBe('tenant@example.com');
  });

  it('does not use uuid-shaped values as person display names', () => {
    const uuid = '13a907c7-8537-459a-be49-ff30cfc0083f';
    const uuidLog: AccessLog = {
      ...baseLog,
      method: 'app',
      actor_type: 'user',
      user_id: uuid,
      user_name: uuid,
      metadata: {
        user: {
          id: uuid,
          name: uuid,
          navigation_url: `/users/${uuid}/details`,
        },
      },
    };

    expect(getAccessLogUserLink(uuidLog)).toBeNull();
    expect(getAccessUserDisplay(uuidLog).primary).toBe('—');
  });

  it('ignores Unknown User placeholders when a resolved user name exists', () => {
    const log: AccessLog = {
      ...baseLog,
      method: 'mobile_key',
      actor_type: 'user',
      user_id: 'user-1',
      user_name: 'Casey Jones',
      metadata: {
        actor: { type: 'user', name: 'Unknown User' },
        user: {
          id: 'user-1',
          name: 'Casey Jones',
          navigation_url: '/users/user-1/details',
        },
      },
    };

    expect(getAccessUserDisplay(log).primary).toBe('Casey Jones');
  });

  it('ignores Unknown User when it is the only name candidate', () => {
    const log: AccessLog = {
      ...baseLog,
      method: 'mobile_key',
      actor_type: 'user',
      user_id: 'user-1',
      user_name: 'Unknown User',
      user_email: 'casey@example.com',
      metadata: {
        user: {
          id: 'user-1',
          name: 'Unknown User',
          email: 'casey@example.com',
          navigation_url: '/users/user-1/details',
        },
      },
    };

    expect(getAccessUserDisplay(log).primary).toBe('casey@example.com');
  });

  it('uses email when route-pass style logs only have a linked user id', () => {
    const linkedLog: AccessLog = {
      ...baseLog,
      method: 'route_pass',
      actor_type: 'user',
      user_id: 'user-9',
      user_email: 'tenant@example.com',
      metadata: {
        user: {
          id: 'user-9',
          name: 'User',
          email: 'tenant@example.com',
          navigation_url: '/users/user-9/details',
        },
      },
    };

    expect(getAccessLogUserLink(linkedLog)?.label).toBe('tenant@example.com');
    expect(getAccessUserDisplay(linkedLog).primary).toBe('tenant@example.com');
  });

  it('labels keypad user links from metadata id and user_name when name is missing', () => {
    const linkedLog: AccessLog = {
      ...baseLog,
      method: 'keypad',
      user_id: 'user-4',
      user_name: 'Alex Tenant',
      metadata: {
        user: {
          id: 'user-4',
          name: '',
          navigation_url: '/users/user-4/details',
        },
      },
    };

    const items = buildAccessLogDetailItems(linkedLog, true, { omitRowSummaryFields: true });
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'User',
          value: 'Alex Tenant',
          href: '/users/user-4/details',
          navigationId: 'user-4',
          navigationTarget: 'user',
        }),
      ]),
    );
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
    expect(formatAccessMethod('remote_gateway')).toBe('Cloud');
    expect(formatAccessMethod('admin_remote')).toBe('Cloud');
    expect(getAccessFailureDetail(denied)).toBe('Out of schedule window');
  });

  it('labels remote unlock cycle actions and shows initiator on correlated site unlock', () => {
    const grant: AccessLog = {
      ...baseLog,
      action: 'remote_access_granted',
      method: 'admin_remote',
      metadata: {
        initiated_by: { id: 'fm-1', name: 'Facility Manager', navigation_url: '/users/fm-1/details' },
      },
    };
    const siteUnlock: AccessLog = {
      ...baseLog,
      action: 'unlock',
      method: 'local_device',
      user_id: 'fm-1',
      user_name: 'Facility Manager',
      metadata: {
        correlated_remote: true,
        initiated_by: { id: 'fm-1', name: 'Facility Manager', navigation_url: '/users/fm-1/details' },
      },
    };
    const manualLock: AccessLog = {
      ...baseLog,
      action: 'lock',
      method: 'local_device',
      user_id: undefined,
      user_name: undefined,
      metadata: {},
    };

    expect(formatAccessAction(grant)).toBe('Remote Access Granted');
    expect(formatAccessAction(siteUnlock)).toBe('Unlocked at site');
    expect(formatAccessAction(manualLock)).toBe('Manually Locked');
    expect(formatAccessMethod(manualLock)).toBe('Manual lock');
    expect(getAccessUserDisplay(siteUnlock).primary).toBe('Facility Manager');
    expect(getAccessUserDisplay(manualLock).primary).toBe('—');
  });

  it('hides facility in location primary when facility scoped', () => {
    const scoped = getAccessLocationDisplay(baseLog, { hideFacility: true });
    expect(scoped.primary).toBe('Unit A-101');
    expect(scoped.primary).not.toContain('Petrolia');
  });

  it('builds expanded detail items with device link metadata', () => {
    const items = buildAccessLogDetailItems(baseLog, true);
    expect(items.some((item) => item.label === 'Device' && item.href)).toBe(true);
    expect(items.some((item) => item.label === 'Actor detail')).toBe(false);
  });

  it('omits row-visible fields in compact detail mode', () => {
    const items = buildAccessLogDetailItems(baseLog, true, { omitRowSummaryFields: true });
    expect(items.some((item) => item.label === 'Action')).toBe(false);
    expect(items.some((item) => item.label === 'User')).toBe(false);
    expect(items.some((item) => item.label === 'Occurred')).toBe(false);
  });

  it('shows failure reason in compact detail mode for failed events', () => {
    const denied: AccessLog = {
      ...baseLog,
      action: 'unlock_attempt',
      success: false,
      metadata: {
        failure_summary: 'Remote unlock failed: device remained locked',
        description: 'Remote unlock failed: device remained locked',
      },
    };
    const items = buildAccessLogDetailItems(denied, true, { omitRowSummaryFields: true });
    expect(items.some((item) => item.label === 'Failure reason')).toBe(true);
    expect(items.some((item) => item.label === 'Notes')).toBe(false);
  });

  it('combines settlement mismatch label with result message', () => {
    const denied: AccessLog = {
      ...baseLog,
      action: 'unlock_attempt',
      success: false,
      denial_reason: 'settlement_mismatch',
      reason: 'Remote unlock failed: device remained locked',
      metadata: {
        failure_summary:
          'Device did not reach the requested lock state — Remote unlock failed: device remained locked',
      },
    };
    expect(getAccessFailureDetail(denied)).toContain('did not reach the requested lock state');
    expect(getAccessFailureDetail(denied)).toContain('remained locked');
  });

  it('hides uuid-shaped unit numbers and device ids from labels', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440011';
    const acLog: AccessLog = {
      ...baseLog,
      device_type: 'access_control',
      unit_number: uuid,
      device_name: uuid,
      device_serial: undefined,
      device_id: uuid,
      metadata: {
        device: { id: uuid, name: uuid, navigation_url: `/devices/access-control/${uuid}` },
      },
    };
    expect(formatAccessHistoryUnitLabel(acLog, getAccessLogMetadata(acLog))).toBeNull();
    expect(formatAccessHistoryDeviceLabel(acLog, {
      device: { id: uuid, name: uuid, navigation_url: `/devices/access-control/${uuid}` },
    })).toBe('Access point');
  });

  it('shows BluLok unit number instead of lock id UUID or lock number', () => {
    const lockId = 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2';
    const log: AccessLog = {
      ...baseLog,
      device_serial: lockId,
      unit_number: '106',
      device_name: `Lock ${lockId}`,
      metadata: {
        ...baseLog.metadata,
        unit: { id: 'unit-1', number: '106', navigation_url: '/units/unit-1' },
        device: {
          id: 'dev-1',
          name: `Lock ${lockId}`,
          navigation_url: '/devices/blulok/dev-1',
          device_settings: { lockNumber: 106 },
        },
      },
    };

    expect(formatAccessHistoryDeviceLabel(log, getAccessLogMetadata(log))).toBe('106');
  });

  it('shows Unassigned serial prefix for vacant BluLok devices', () => {
    const log: AccessLog = {
      ...baseLog,
      device_serial: 'SN12345678',
      unit_number: undefined,
      device_name: 'Lock #106',
      metadata: {
        ...baseLog.metadata,
        device: {
          id: 'dev-1',
          name: 'Lock #106',
          navigation_url: '/devices/blulok/dev-1',
          device_settings: { lockNumber: 106 },
        },
      },
    };

    expect(formatAccessHistoryDeviceLabel(log, getAccessLogMetadata(log))).toBe('Unassigned - 12345');
  });

  it('partitions failure and notes from contextual detail fields', () => {
    const items = buildAccessLogDetailItems(
      {
        ...baseLog,
        success: false,
        metadata: {
          failure_summary: 'Device offline',
          description: 'Additional operator note',
        },
      },
      true,
      { omitRowSummaryFields: true },
    );

    const partitioned = partitionAccessLogDetailItems(items);
    expect(partitioned.failure?.value).toBe('Device offline');
    expect(partitioned.notes?.value).toBe('Additional operator note');
    expect(partitioned.fields.some((item) => item.label === 'Failure reason')).toBe(false);
  });

  it('formats occupied-unit override subtitle and amber action tone', () => {
    const overrideLog: AccessLog = {
      ...baseLog,
      action: 'unlock',
      method: 'admin_remote',
      metadata: {
        occupied_unit_override: true,
        tenant_unlock_override: {
          reason: 'emergency',
          reason_label: 'Emergency (Fire, flood, other)',
        },
      },
    };

    expect(getOccupiedUnlockOverrideReasonLabel(overrideLog)).toBe(
      'Emergency (Fire, flood, other)',
    );
    expect(formatOccupiedUnlockOverrideSubtitle(overrideLog)).toBe(
      'Occupied unit · Emergency (Fire, flood, other)',
    );
    expect(getAccessActionToneClass(overrideLog)).toContain('amber');
    expect(getAccessActionIconTileClass(overrideLog)).toContain('amber');
    expect(getAccessActionIconTileClass({ ...baseLog, action: 'unlock', success: true, metadata: {} })).toContain('green');
    expect(getAccessMethodToneClass({ ...baseLog, method: 'admin_remote', metadata: {} })).toContain('147FD4');
  });
});
