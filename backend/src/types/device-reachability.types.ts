import type { DeviceReachabilityResult } from '@/utils/device-reachability.utils';
import type { AccessControlDevice, DeviceWithContext } from '@/models/device.model';

/** Fields read from BluLok rows when resolving gateway reachability. */
export interface BluLokReachabilitySource {
  facility_id?: string | null;
  gateway_facility_id?: string | null;
  device_status?: string | null;
  reported_device_status?: string | null;
}

/** Fields read from access-control rows when resolving gateway reachability. */
export interface AccessControlReachabilitySource {
  facility_id?: string | null;
  status?: string | null;
  reported_status?: string | null;
}

/** Fields read from network-infra list rows when resolving gateway reachability. */
export interface NetworkInfraReachabilitySource {
  facility_id?: string | null;
  device_kind?: string | null;
  status?: string | null;
  state?: string | null;
}

/** Fields read from unit list/detail rows that expose lock reachability. */
export interface UnitReachabilitySource {
  facility_id?: string | null;
  device_status?: string | null;
  reported_device_status?: string | null;
  blulok_device?: BluLokReachabilitySource | null;
}

export type BluLokReachabilityFields = {
  device_status: string;
  reported_device_status: string;
  status_unreachable_reason: DeviceReachabilityResult['status_unreachable_reason'];
};

export type AccessControlReachabilityFields = {
  status: string;
  reported_status: string;
  status_unreachable_reason: DeviceReachabilityResult['status_unreachable_reason'];
};

export type NetworkInfraReachabilityFields = AccessControlReachabilityFields;

export type UnitReachabilityFields = BluLokReachabilityFields & {
  is_online?: boolean;
  blulok_device?: (BluLokReachabilitySource & BluLokReachabilityFields) | null;
};

/** Facility hierarchy payload enriched at REST read boundaries. */
export interface FacilityDeviceHierarchyEnrichmentInput {
  facility?: { id?: string; name?: string } | null;
  gateway?: { status?: string; facility_id?: string } | null;
  accessControlDevices?: AccessControlDevice[];
  blulokDevices?: DeviceWithContext[];
}

/** Effective status from an enriched BluLok or access-control row. */
export function effectiveStatusFromEnrichedRow(row: {
  device_status?: string | null;
  status?: string | null;
}): string {
  return String(row.device_status ?? row.status ?? 'offline');
}
