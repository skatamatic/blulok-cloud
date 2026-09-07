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

  it('parses failed add lock/access serials and blank input', () => {
    expect(parseInventorySyncError('')).toBeNull();
    expect(parseInventorySyncError('unrelated failure')).toBeNull();
    expect(
      extractDeviceSerialFromInventoryError('Failed to add device SERIAL-LOCK: boom'),
    ).toBe('SERIAL-LOCK');
    expect(
      extractDeviceSerialFromInventoryError(
        'Failed to add access control GATE::relay1: boom',
      ),
    ).toBe('GATE');
    const accessIssue = parseInventorySyncError(
      'Failed to add access control AC-9: something else',
    );
    expect(accessIssue).toEqual(
      expect.objectContaining({
        kind: 'other',
        deviceSerial: 'AC-9',
        deviceKind: 'access_control',
      }),
    );
  });

  it('formats access-device and missing-facility conflict copy', () => {
    expect(formatSerialConflictDescription(null)).toBe(
      'already registered at another facility',
    );
    expect(
      formatSerialConflictDescription({
        facilityId: 'fac-2',
        facilityName: 'Riverside Storage',
        accessDeviceName: 'Front gate',
      }),
    ).toContain('access device “Front gate”');
    expect(
      formatSerialConflictDescription(
        {
          facilityId: 'fac-1',
          facilityName: '621 Sandbox',
          accessDeviceName: 'Front gate',
        },
        'fac-1',
      ),
    ).toContain('at this facility as access device');
    expect(
      formatSerialConflictDescription(
        {
          facilityId: 'fac-1',
          facilityName: '621 Sandbox',
        },
        'fac-1',
      ),
    ).toBe('already registered at this facility (not assigned to a unit)');
  });

  it('builds same-facility duplicate and generic sync error notifications', () => {
    const issue = parseInventorySyncError(duplicateRaw, 'blulok')!;
    const sameFacility = buildInventorySyncIssueNotification({
      issue,
      sourceFacilityName: '621 Sandbox',
      sourceFacilityId: 'fac-1',
      conflict: {
        facilityId: 'fac-1',
        facilityName: '621 Sandbox',
        unitNumber: 'A-1',
      },
    });
    expect(sameFacility.message).toMatch(/Remove the duplicate/);
    expect(sameFacility.priority).toBe('urgent');

    const other = buildInventorySyncIssueNotification({
      issue: {
        kind: 'other',
        deviceSerial: 'AC-9',
        deviceKind: 'access_control',
        rawError: 'Failed to add access control AC-9: boom',
      },
      sourceFacilityName: '621 Sandbox',
    });
    expect(other.title).toMatch(/inventory sync error/i);
    expect(other.priority).toBe('high');
    expect(other.message).toContain('access control device');
  });
});
