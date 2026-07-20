import { DeviceModel } from '@/models/device.model';
import { AuthService } from '@/services/auth.service';
import {
  AccessDeniedError,
  AppError,
  ConflictError,
  NotFoundError,
} from '@/middleware/error.middleware';
import { UserRole } from '@/types/auth.types';

type ProvisionUser = {
  role: UserRole;
  facilityIds?: string[];
};

const SYNC_MANAGED_METADATA_KEYS = ['createdFromGatewaySync'] as const;

/**
 * Metadata for admin UI / REST creates.
 * Both flags are explicit so clients can distinguish pre-provisioned rows from gateway-seen ones.
 */
export function buildManualProvisionMetadata(
  clientMetadata?: Record<string, unknown> | null
): Record<string, unknown> {
  const base =
    clientMetadata && typeof clientMetadata === 'object' ? { ...clientMetadata } : {};
  for (const key of SYNC_MANAGED_METADATA_KEYS) {
    delete base[key];
  }
  base.manuallyAdded = true;
  base.createdFromGatewaySync = false;
  return base;
}

/**
 * Metadata for gateway inventory auto-provision (sync-managed).
 */
export function buildGatewayProvisionMetadata(): Record<string, unknown> {
  return {
    createdFromGatewaySync: true,
    manuallyAdded: false,
  };
}

/**
 * When inventory matches a manually pre-provisioned row, mark that the gateway reported it.
 * Preserves `manuallyAdded` so the row stays non-deletable by sync.
 * Returns null when the row is not manual or already marked seen.
 */
export function markGatewayInventorySeenMetadata(
  existing?: Record<string, unknown> | null
): Record<string, unknown> | null {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  if (base.manuallyAdded !== true) {
    return null;
  }
  if (base.createdFromGatewaySync === true) {
    return null;
  }
  return {
    ...base,
    manuallyAdded: true,
    createdFromGatewaySync: true,
  };
}

export async function assertUserCanProvisionOnGateway(
  user: ProvisionUser,
  gatewayId: string,
  model: DeviceModel = new DeviceModel()
): Promise<{ id: string; facility_id: string; name: string }> {
  const gateway = await model.findGatewayById(gatewayId);
  if (!gateway) {
    throw new NotFoundError('Gateway not found');
  }
  if (
    AuthService.isFacilityScoped(user.role) &&
    !user.facilityIds?.includes(gateway.facility_id)
  ) {
    throw new AccessDeniedError('Access denied to this facility');
  }
  return gateway;
}

export async function assertUnitBelongsToGatewayFacility(
  unitId: string,
  facilityId: string,
  model: DeviceModel = new DeviceModel()
): Promise<void> {
  const unitFacilityId = await model.findUnitFacilityId(unitId);
  if (!unitFacilityId) {
    throw new NotFoundError('Unit not found');
  }
  if (unitFacilityId !== String(facilityId)) {
    throw new ConflictError('Unit does not belong to this facility');
  }
}

export async function assertUnitAvailableForBluLok(
  unitId: string,
  model: DeviceModel = new DeviceModel()
): Promise<void> {
  const existing = await model.findBluLokByUnitId(unitId);
  if (existing) {
    throw new ConflictError('This unit already has a lock assigned');
  }
}

/**
 * Map MySQL duplicate-key errors to operational conflict responses.
 */
export function mapDeviceProvisionDatabaseError(err: unknown): AppError | null {
  if (!err || typeof err !== 'object') return null;
  const record = err as { code?: string; errno?: number; message?: string };
  const message = String(record.message ?? '');
  if (record.code !== 'ER_DUP_ENTRY' && record.errno !== 1062) {
    return null;
  }
  if (message.includes('device_serial')) {
    return new ConflictError('Device serial is already in use');
  }
  if (message.includes('unit_id')) {
    return new ConflictError('This unit already has a lock assigned');
  }
  return new ConflictError('A device with these details already exists');
}
