import type { DeviceSyncKind } from '@/types/gateway-device-sync.types';

export type InventorySyncIssueKind = 'duplicate_serial' | 'other';

export interface ParsedInventorySyncIssue {
  kind: InventorySyncIssueKind;
  deviceSerial: string;
  deviceKind: DeviceSyncKind;
  rawError: string;
}

const DUPLICATE_ENTRY_SERIAL =
  /Duplicate entry '([^']+)' for key '[^']*device_serial[^']*'/i;

const FAILED_ADD_LOCK = /Failed to add device ([^:\s]+)/i;

const FAILED_ADD_ACCESS = /Failed to add access control ([^:\s]+)/i;

function inferDeviceKind(raw: string, hint?: DeviceSyncKind): DeviceSyncKind {
  if (hint) return hint;
  if (/access control/i.test(raw)) return 'access_control';
  return 'blulok';
}

export function extractDeviceSerialFromInventoryError(raw: string): string | null {
  const duplicateMatch = raw.match(DUPLICATE_ENTRY_SERIAL);
  if (duplicateMatch?.[1]) {
    return duplicateMatch[1].trim();
  }

  const lockMatch = raw.match(FAILED_ADD_LOCK);
  if (lockMatch?.[1]) {
    return lockMatch[1].trim();
  }

  const accessMatch = raw.match(FAILED_ADD_ACCESS);
  if (accessMatch?.[1]) {
    const token = accessMatch[1].trim();
    return token.includes('::') ? token.split('::')[0] : token;
  }

  return null;
}

export function isDuplicateSerialInventoryError(raw: string): boolean {
  return DUPLICATE_ENTRY_SERIAL.test(raw) || /duplicate entry/i.test(raw);
}

export function parseInventorySyncError(
  raw: string,
  deviceKindHint?: DeviceSyncKind,
): ParsedInventorySyncIssue | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const deviceSerial = extractDeviceSerialFromInventoryError(trimmed);
  if (!deviceSerial) {
    return null;
  }

  return {
    kind: isDuplicateSerialInventoryError(trimmed) ? 'duplicate_serial' : 'other',
    deviceSerial,
    deviceKind: inferDeviceKind(trimmed, deviceKindHint),
    rawError: trimmed,
  };
}

export interface SerialConflictContext {
  facilityId: string;
  facilityName: string;
  unitId?: string | null;
  unitNumber?: string | null;
  /** Access-control label when no unit applies. */
  accessDeviceName?: string | null;
}

export function formatSerialConflictDescription(
  conflict: SerialConflictContext | null | undefined,
  sourceFacilityId?: string,
): string {
  if (!conflict?.facilityName) {
    return 'already registered at another facility';
  }

  const atSameFacility = Boolean(
    sourceFacilityId && conflict.facilityId === sourceFacilityId,
  );

  if (conflict.unitNumber) {
    return atSameFacility
      ? `already registered at this facility on unit ${conflict.unitNumber}`
      : `already registered at “${conflict.facilityName}” on unit ${conflict.unitNumber}`;
  }

  if (conflict.accessDeviceName) {
    return atSameFacility
      ? `already registered at this facility as access device “${conflict.accessDeviceName}” (not linked to a storage unit)`
      : `already registered at “${conflict.facilityName}” as access device “${conflict.accessDeviceName}” (not linked to a storage unit)`;
  }

  return atSameFacility
    ? 'already registered at this facility (not assigned to a unit)'
    : `already registered at “${conflict.facilityName}” (not assigned to a unit)`;
}

export function buildInventorySyncIssueNotification(params: {
  issue: ParsedInventorySyncIssue;
  sourceFacilityName: string;
  sourceFacilityId?: string;
  conflict?: SerialConflictContext | null;
}): { title: string; message: string; priority: 'urgent' | 'high' } {
  const { issue, sourceFacilityName, sourceFacilityId, conflict } = params;
  const deviceLabel = issue.deviceKind === 'blulok' ? 'lock' : 'access control device';

  if (issue.kind === 'duplicate_serial') {
    const whereRegistered = formatSerialConflictDescription(conflict, sourceFacilityId);
    const atSameFacility = Boolean(
      sourceFacilityId && conflict?.facilityId === sourceFacilityId,
    );
    const contextNote = atSameFacility
      ? 'Remove the duplicate from the gateway inventory or retire the existing device record before re-adding it. '
      : 'Device serials must be unique across all facilities. ';

    return {
      title: `Duplicate ${deviceLabel} serial blocked`,
      message:
        `Gateway inventory sync at ${sourceFacilityName} could not add ${deviceLabel} serial ` +
        `${issue.deviceSerial} because that serial is ${whereRegistered}. ` +
        contextNote +
        'This often happens during commissioning or when a lock was incorrectly programmed with a duplicate factory serial.',
      priority: 'urgent',
    };
  }

  return {
    title: `Device inventory sync error`,
    message:
      `Gateway inventory sync at ${sourceFacilityName} failed for ${deviceLabel} serial ` +
      `${issue.deviceSerial}. Review the inventory sync history for technical details.`,
    priority: 'high',
  };
}
