import {
  buildInventorySyncIssueNotification,
  extractDeviceSerialFromInventoryError,
  formatSerialConflictDescription,
  isDuplicateSerialInventoryError,
  parseInventorySyncError,
} from '@/utils/inventory-sync-error-notification.util';

describe('inventory-sync-error-notification.util', () => {
  const duplicateRaw =
    "Failed to add device c6c2a375-7c8b-4765-a00a-4e3852535c5f: insert into `blulok_devices` (...) - Duplicate entry 'c6c2a375-7c8b-4765-a00a-4e3852535c5f' for key 'blulok_devices.blulok_devices_device_serial_unique'";

  it('detects duplicate serial errors', () => {
    expect(isDuplicateSerialInventoryError(duplicateRaw)).toBe(true);
    expect(extractDeviceSerialFromInventoryError(duplicateRaw)).toBe(
      'c6c2a375-7c8b-4765-a00a-4e3852535c5f',
    );
  });

  it('parses duplicate serial issues', () => {
    const issue = parseInventorySyncError(duplicateRaw, 'blulok');
    expect(issue).toEqual(
      expect.objectContaining({
        kind: 'duplicate_serial',
        deviceSerial: 'c6c2a375-7c8b-4765-a00a-4e3852535c5f',
        deviceKind: 'blulok',
      }),
    );
  });

  it('formats conflict location with facility and unit', () => {
    expect(
      formatSerialConflictDescription({
        facilityId: 'fac-2',
        facilityName: 'Riverside Storage',
        unitId: 'unit-9',
        unitNumber: 'B-205',
      }),
    ).toBe('already registered at “Riverside Storage” on unit B-205');
  });

  it('formats conflict location without unit assignment', () => {
    expect(
      formatSerialConflictDescription({
        facilityId: 'fac-2',
        facilityName: 'Riverside Storage',
        unitId: null,
        unitNumber: null,
      }),
    ).toBe('already registered at “Riverside Storage” (not assigned to a unit)');
  });

  it('formats same-facility duplicate copy', () => {
    expect(
      formatSerialConflictDescription(
        {
          facilityId: 'fac-1',
          facilityName: '621 Sandbox',
          unitId: 'unit-9',
          unitNumber: 'B-205',
        },
        'fac-1',
      ),
    ).toBe('already registered at this facility on unit B-205');
  });

  it('builds human-friendly duplicate serial copy with unit context', () => {
    const issue = parseInventorySyncError(duplicateRaw, 'blulok');
    expect(issue).not.toBeNull();
    const copy = buildInventorySyncIssueNotification({
      issue: issue!,
      sourceFacilityName: '621 Sandbox',
      conflict: {
        facilityId: 'fac-2',
        facilityName: 'Riverside Storage',
        unitId: 'unit-9',
        unitNumber: 'B-205',
      },
    });

    expect(copy.title).toMatch(/duplicate lock serial/i);
    expect(copy.message).toContain('621 Sandbox');
    expect(copy.message).toContain('Riverside Storage');
    expect(copy.message).toContain('unit B-205');
    expect(copy.message).toContain('c6c2a375-7c8b-4765-a00a-4e3852535c5f');
    expect(copy.message).toMatch(/unique across all facilities/i);
    expect(copy.priority).toBe('urgent');
  });
});
