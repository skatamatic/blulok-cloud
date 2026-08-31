import { attributionFromAccessSession } from '@/services/lock-command-attribution';

describe('lock-command-attribution', () => {
  const baseSession = {
    id: 'sess-1',
    remote_command_id: 'cmd-1',
    gateway_id: 'gw-1',
    facility_id: 'fac-1',
    unit_id: 'unit-1',
    device_type: 'blulok' as const,
    actor_id: 'u1',
    actor_name: 'Ada',
    actor_role: 'facility_admin',
    metadata: null as Record<string, unknown> | null,
  };

  it('returns null when required identity fields are missing', () => {
    expect(
      attributionFromAccessSession({ ...baseSession, remote_command_id: null }),
    ).toBeNull();
    expect(attributionFromAccessSession({ ...baseSession, actor_id: null })).toBeNull();
    expect(
      attributionFromAccessSession({ ...baseSession, facility_id: null }),
    ).toBeNull();
  });

  it('maps session fields and falls back when metadata is absent', () => {
    const attr = attributionFromAccessSession(baseSession);
    expect(attr).toEqual({
      commandId: 'cmd-1',
      initiator: {
        userId: 'u1',
        userName: 'Ada',
        role: 'facility_admin',
      },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      unitId: 'unit-1',
      requestedStatus: 'unlocked',
      deviceType: 'blulok',
      tenantUnlockOverride: undefined,
    });
  });

  it('prefers initiated_by metadata and tenant unlock override', () => {
    const attr = attributionFromAccessSession({
      ...baseSession,
      gateway_id: null,
      unit_id: null,
      actor_name: null,
      actor_role: null,
      metadata: {
        initiated_by: { id: 'admin-9', name: 'Root', role: 'admin' },
        tenant_unlock_override: {
          reason: 'emergency',
          reason_label: 'Emergency',
          notes: 'flood',
        },
      },
    });
    expect(attr?.initiator).toEqual({
      userId: 'admin-9',
      userName: 'Root',
      role: 'admin',
    });
    expect(attr?.gatewayId).toBe('');
    expect(attr?.unitId).toBeUndefined();
    expect(attr?.tenantUnlockOverride).toEqual({
      reason: 'emergency',
      reasonLabel: 'Emergency',
      notes: 'flood',
    });
  });

  it('uses reason as label when reason_label is omitted', () => {
    const attr = attributionFromAccessSession({
      ...baseSession,
      metadata: {
        tenant_unlock_override: { reason: 'testing_maintenance' },
      },
    });
    expect(attr?.tenantUnlockOverride).toEqual({
      reason: 'testing_maintenance',
      reasonLabel: 'testing_maintenance',
      notes: undefined,
    });
  });
});
