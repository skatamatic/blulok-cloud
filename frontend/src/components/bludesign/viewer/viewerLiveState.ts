/**
 * Live state mapping for BluDesign facility viewers.
 * Converts BluLok REST + WebSocket telemetry into viewer visual states.
 */

import { DeviceState } from '../core/types';
import {
  getBluLokDevices,
  getBluLokUnits,
  type BluLokUnit,
  type BluLokAccessControlDevice,
} from '@/api/bludesign';
import type { LockDeviceSnapshot } from '@/utils/deviceStatusWs.utils';

export interface ViewerSmartAssetState {
  entityId: string;
  entityType: 'unit' | 'gate' | 'elevator' | 'door';
  state: DeviceState;
  lockStatus?: string;
  batteryLevel?: number;
  lastActivity?: string;
}

/**
 * Map lock + device telemetry to a 3D/2D DeviceState.
 * Priority: offline → error → maintenance → lock position.
 */
export function resolveDeviceStateFromTelemetry(
  lockStatus?: string,
  deviceStatus?: string,
): DeviceState {
  if (deviceStatus === 'offline') return DeviceState.OFFLINE;
  if (deviceStatus === 'error' || lockStatus === 'error') return DeviceState.ERROR;
  if (deviceStatus === 'maintenance' || lockStatus === 'maintenance') {
    return DeviceState.MAINTENANCE;
  }
  if (lockStatus === 'unlocked' || lockStatus === 'unlocking') return DeviceState.UNLOCKED;
  if (lockStatus === 'locked' || lockStatus === 'locking') return DeviceState.LOCKED;
  return DeviceState.LOCKED;
}

export function resolveAccessControlDeviceState(
  status: string,
  isLocked: boolean,
): DeviceState {
  if (status === 'offline') return DeviceState.OFFLINE;
  if (status === 'error') return DeviceState.ERROR;
  if (status === 'maintenance') return DeviceState.MAINTENANCE;
  return isLocked ? DeviceState.LOCKED : DeviceState.UNLOCKED;
}

function accessControlEntityType(
  deviceType: BluLokAccessControlDevice['device_type'],
): ViewerSmartAssetState['entityType'] {
  if (deviceType === 'gate') return 'gate';
  if (deviceType === 'elevator') return 'elevator';
  return 'door';
}

/**
 * Expand a snapshot to all entity IDs that may appear in scene bindings
 * (unit UUID and/or device UUID).
 */
export function snapshotToViewerStates(snapshot: LockDeviceSnapshot): ViewerSmartAssetState[] {
  const primaryId = snapshot.unit_id ?? snapshot.device_id;
  if (!primaryId) return [];

  const state = resolveDeviceStateFromTelemetry(snapshot.lock_status, snapshot.device_status);
  const entityType: ViewerSmartAssetState['entityType'] = snapshot.unit_id ? 'unit' : 'door';
  const base: ViewerSmartAssetState = {
    entityId: primaryId,
    entityType,
    state,
    lockStatus: snapshot.lock_status,
    batteryLevel: snapshot.battery_level,
    lastActivity: snapshot.last_activity ?? snapshot.last_seen,
  };

  const ids = new Set<string>();
  if (snapshot.unit_id) ids.add(snapshot.unit_id);
  if (snapshot.device_id) ids.add(snapshot.device_id);

  return Array.from(ids).map((id) => ({ ...base, entityId: id }));
}

export function bluLokUnitToViewerStates(unit: BluLokUnit): ViewerSmartAssetState[] {
  if (!unit.device) return [];
  return snapshotToViewerStates({
    unit_id: unit.id,
    device_id: unit.device.id,
    lock_status: unit.device.lock_status,
    device_status: unit.device.device_status,
    battery_level: unit.device.battery_level,
    last_activity: unit.last_activity,
  });
}

export function accessControlDeviceToViewerState(
  device: BluLokAccessControlDevice,
): ViewerSmartAssetState {
  return {
    entityId: device.id,
    entityType: accessControlEntityType(device.device_type),
    state: resolveAccessControlDeviceState(device.status, device.is_locked),
    lockStatus: device.is_locked ? 'locked' : 'unlocked',
  };
}

export interface FacilityViewerHydration {
  liveStates: ViewerSmartAssetState[];
  unitsById: Map<string, BluLokUnit>;
}

export async function fetchFacilityViewerHydration(
  bluLokFacilityId: string,
): Promise<FacilityViewerHydration> {
  const [units, devices] = await Promise.all([
    getBluLokUnits(bluLokFacilityId),
    getBluLokDevices(bluLokFacilityId),
  ]);

  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const byEntity = new Map<string, ViewerSmartAssetState>();
  for (const unit of units) {
    for (const state of bluLokUnitToViewerStates(unit)) {
      byEntity.set(state.entityId, state);
    }
  }
  for (const device of devices) {
    const state = accessControlDeviceToViewerState(device);
    byEntity.set(state.entityId, state);
  }
  return {
    liveStates: Array.from(byEntity.values()),
    unitsById,
  };
}

/** @deprecated Use fetchFacilityViewerHydration */
export async function fetchFacilityViewerLiveStates(
  bluLokFacilityId: string,
): Promise<ViewerSmartAssetState[]> {
  const { liveStates } = await fetchFacilityViewerHydration(bluLokFacilityId);
  return liveStates;
}
