import type { AccessEventDenialReason } from '@protocol/access-events';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import type { DeviceSimulatorState } from '@protocol/device-simulator-state';
import type {
  TryOpenWithUserDeviceRequest,
  TryOpenWithUserDeviceResult,
  UserProfile,
} from '@protocol/user-simulator-state';
import { evaluateRoutePassForDevice } from '../users/route-pass-verification.utils';
import { findCachedPass, findUserDevice } from '../users/user-device.utils';

export type TryOpenLockContext = {
  facilityId: string;
  gatewayId: string;
  deviceKey: string;
  inventoryItem: DeviceInventoryItem;
  deviceSim?: DeviceSimulatorState;
  opsPublicKeyB64: string;
  userProfile: UserProfile;
  appDeviceId: string;
  resolveCloudDeviceId?: () => Promise<string | null>;
  applyUnlock: () => void | Promise<void>;
  emitAccessEvent: (input: {
    success: boolean;
    denial_reason?: AccessEventDenialReason;
    userId?: string;
    role?: string;
  }) => Promise<void>;
};

export async function tryOpenLockWithUserDevice(
  ctx: TryOpenLockContext,
): Promise<TryOpenWithUserDeviceResult> {
  const device = findUserDevice(ctx.userProfile, ctx.appDeviceId);
  if (!device) {
    return { granted: false, message: 'User device not found', lockUpdated: false };
  }

  const cached = findCachedPass(device, ctx.facilityId);
  if (!cached?.jwt) {
    return {
      granted: false,
      message: 'No route pass cached — fetch one for this facility first',
      denial_reason: 'invalid_credential',
      lockUpdated: false,
    };
  }

  const opsKey = ctx.opsPublicKeyB64 || ctx.userProfile.opsPublicKeyB64 || '';
  if (!opsKey) {
    return {
      granted: false,
      message: 'Missing operations public key — log in or connect gateway',
      denial_reason: 'internal_error',
      lockUpdated: false,
    };
  }

  let lockSerial = '';
  let accessControlCloudId: string | undefined;
  let deviceKind: 'lock' | 'access_control';

  if (ctx.inventoryItem.kind === 'lock') {
    lockSerial = ctx.inventoryItem.lock_id;
    deviceKind = 'lock';
  } else if (ctx.inventoryItem.kind === 'access_control') {
    deviceKind = 'access_control';
    lockSerial = ctx.inventoryItem.access_id;
    if (ctx.resolveCloudDeviceId) {
      accessControlCloudId = (await ctx.resolveCloudDeviceId()) ?? undefined;
    }
  } else {
    return {
      granted: false,
      message: 'Route pass unlock only supported for locks and access control',
      lockUpdated: false,
    };
  }

  const denylistSubs = ctx.deviceSim?.denylist.map((row) => row.sub) ?? [];
  const evaluation = await evaluateRoutePassForDevice({
    routePassJwt: cached.jwt,
    opsPublicKeyB64: opsKey,
    lockSerial,
    accessControlCloudId,
    deviceKind,
    denylistSubs,
    tamper: cached.tamper,
  });

  if (!evaluation.granted) {
    await ctx.emitAccessEvent({
      success: false,
      denial_reason: evaluation.reason,
      userId: ctx.userProfile.cloudUserId,
      role: ctx.userProfile.role,
    });
    return {
      granted: false,
      message: evaluation.message,
      denial_reason: evaluation.reason,
      lockUpdated: false,
    };
  }

  await Promise.resolve(ctx.applyUnlock());
  try {
    await ctx.emitAccessEvent({
      success: true,
      userId: ctx.userProfile.cloudUserId,
      role: ctx.userProfile.role,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      granted: true,
      message: `Unlocked locally; failed to report access event: ${detail}`,
      lockUpdated: true,
    };
  }
  return { granted: true, message: 'Access granted via route pass', lockUpdated: true };
}

export type { TryOpenWithUserDeviceRequest };
