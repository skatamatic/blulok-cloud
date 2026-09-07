import { resolveTenantUnlockOverrideForRemoteUnlock } from '@/services/tenant-unlock-override.service';
import type { Knex } from 'knex';

// Mock the utility modules
const mockUnitHasTenant = jest.fn();
const mockUserIsUnitOccupantOrShareRecipient = jest.fn();

jest.mock('@/utils/unit-has-tenant.utils', () => ({
  unitHasTenant: (...args: unknown[]) => mockUnitHasTenant(...args),
}));

jest.mock('@/utils/unit-occupant-access.utils', () => ({
  userIsUnitOccupantOrShareRecipient: (...args: unknown[]) =>
    mockUserIsUnitOccupantOrShareRecipient(...args),
}));

// Mock the constants module
let mockOCCUPIED_UNIT_OVERRIDE_REQUIRED = false;
const mockIsTenantUnlockOverrideReasonCode = jest.fn((value: unknown) => {
  const validCodes = ['tenant_locked_phone', 'emergency', 'testing_maintenance'];
  return typeof value === 'string' && validCodes.includes(value);
});
const mockLabelForTenantUnlockOverrideReason = jest.fn((code: string) => {
  const labels: Record<string, string> = {
    tenant_locked_phone: 'Tenant locked phone in unit',
    emergency: 'Emergency (Fire, flood, other)',
    testing_maintenance: 'Testing and/or Maintenance',
  };
  return labels[code] || code;
});

jest.mock('@/constants/tenant-unlock-override.constants', () => ({
  get OCCUPIED_UNIT_OVERRIDE_REQUIRED() {
    return mockOCCUPIED_UNIT_OVERRIDE_REQUIRED;
  },
  isTenantUnlockOverrideReasonCode: (value: unknown) =>
    mockIsTenantUnlockOverrideReasonCode(value),
  labelForTenantUnlockOverrideReason: (code: string) =>
    mockLabelForTenantUnlockOverrideReason(code),
}));

describe('resolveTenantUnlockOverrideForRemoteUnlock', () => {
  const mockKnex = {} as Knex;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOCCUPIED_UNIT_OVERRIDE_REQUIRED = false;
  });

  it('returns ok true with no override for vacant unit', async () => {
    mockUnitHasTenant.mockResolvedValue(false);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: undefined,
    });

    expect(result).toEqual({ ok: true });
    expect(mockUserIsUnitOccupantOrShareRecipient).not.toHaveBeenCalled();
  });

  it('returns ok true with no override for occupant user', async () => {
    mockUnitHasTenant.mockResolvedValue(true);
    mockUserIsUnitOccupantOrShareRecipient.mockResolvedValue(true);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: undefined,
    });

    expect(result).toEqual({ ok: true });
  });

  it('returns 400 TENANT_UNLOCK_OVERRIDE_REQUIRED when non-occupant, required, and no reason', async () => {
    mockOCCUPIED_UNIT_OVERRIDE_REQUIRED = true;
    mockUnitHasTenant.mockResolvedValue(true);
    mockUserIsUnitOccupantOrShareRecipient.mockResolvedValue(false);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: undefined,
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'This unit has a tenant. Select a reason before unlocking remotely.',
        code: 'TENANT_UNLOCK_OVERRIDE_REQUIRED',
      },
    });
  });

  it('returns ok with override when non-occupant provides valid reason', async () => {
    mockUnitHasTenant.mockResolvedValue(true);
    mockUserIsUnitOccupantOrShareRecipient.mockResolvedValue(false);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: 'emergency',
      notesRaw: 'Water leak reported',
    });

    expect(result).toEqual({
      ok: true,
      override: {
        reason: 'emergency',
        reasonLabel: 'Emergency (Fire, flood, other)',
        notes: 'Water leak reported',
      },
    });
  });

  it('returns 400 TENANT_UNLOCK_OVERRIDE_INVALID for invalid reason code', async () => {
    mockUnitHasTenant.mockResolvedValue(true);
    mockUserIsUnitOccupantOrShareRecipient.mockResolvedValue(false);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: 'invalid_reason',
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'Invalid tenant_override_reason',
        code: 'TENANT_UNLOCK_OVERRIDE_INVALID',
      },
    });
  });

  it('omits notes field when notes are empty string', async () => {
    mockUnitHasTenant.mockResolvedValue(true);
    mockUserIsUnitOccupantOrShareRecipient.mockResolvedValue(false);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: 'testing_maintenance',
      notesRaw: '   ',
    });

    expect(result).toEqual({
      ok: true,
      override: {
        reason: 'testing_maintenance',
        reasonLabel: 'Testing and/or Maintenance',
      },
    });
  });

  it('returns ok true when override not required and no reason provided', async () => {
    mockOCCUPIED_UNIT_OVERRIDE_REQUIRED = false;
    mockUnitHasTenant.mockResolvedValue(true);
    mockUserIsUnitOccupantOrShareRecipient.mockResolvedValue(false);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: undefined,
    });

    expect(result).toEqual({ ok: true });
  });

  it('trims whitespace from notes before including', async () => {
    mockUnitHasTenant.mockResolvedValue(true);
    mockUserIsUnitOccupantOrShareRecipient.mockResolvedValue(false);

    const result = await resolveTenantUnlockOverrideForRemoteUnlock({
      knex: mockKnex,
      unitId: 'unit-1',
      userId: 'user-1',
      reasonRaw: 'emergency',
      notesRaw: '  Test notes  ',
    });

    expect(result).toEqual({
      ok: true,
      override: {
        reason: 'emergency',
        reasonLabel: 'Emergency (Fire, flood, other)',
        notes: 'Test notes',
      },
    });
  });
});
