import { Ed25519Service } from '@/services/crypto/ed25519.service';

/**
 * Denylist Entry Interface
 *
 * Represents a single user revocation entry in a denylist update.
 * Contains the user ID and expiration timestamp for their access revocation.
 */
export interface DenylistEntry {
  /** User ID (subject) whose access is being revoked */
  sub: string;
  /** Unix timestamp when this revocation expires (or permanent if far future) */
  exp: number;
}

/**
 * Denylist Service
 *
 * Handles the creation and distribution of cryptographically signed denylist updates.
 * Denylists revoke user access to specific BluLok locks, implementing the security
 * model's access revocation mechanism.
 *
 * Key Security Features:
 * - Cryptographic signing with Operations Private Key (Ed25519)
 * - Device-targeted revocation (not broadcast to all locks)
 * - Time-based expiration of revocation entries
 * - Event-driven updates triggered by user deactivation or unit unassignment
 *
 * Usage Flow:
 * 1. Security event occurs (user deactivated, unit unassigned)
 * 2. Service builds signed denylist packet with affected users
 * 3. Gateway unicasts packet to specific target devices
 * 4. Locks update local denylists and reject affected Route Passes
 *
 * Packet Format:
 * ```
 * {
 *   cmd_type: 'DENYLIST_ADD',
 *   denylist_add: [{ sub: 'user123', exp: 1704067200 }],
 *   targets: { device_ids: ['lock1', 'lock2'] }
 * }
 * ```
 */
export class DenylistService {
  /**
   * Build a signed denylist add command.
   * Creates a cryptographically signed packet containing user revocation entries.
   *
   * @param entries - Array of users to revoke access for, with expiration timestamps
   * @param targetDeviceIds - Optional array of specific device IDs to target (partial revocation)
   * @returns Promise resolving to tuple of [signed_payload, detached_signature]
   *
   * @throws Error if cryptographic signing fails
   */
  public static async buildDenylistAdd(entries: DenylistEntry[], targetDeviceIds?: string[]): Promise<[Record<string, any>, string]> {
    const payload: any = { cmd_type: 'DENYLIST_ADD', denylist_add: entries };
    if (targetDeviceIds && targetDeviceIds.length > 0) {
      payload.targets = { device_ids: targetDeviceIds };
    }
    const { payload: p, signature } = await Ed25519Service.signPacket(payload);
    return [p, signature];
  }

  /**
   * Build a signed denylist remove command.
   * Creates a cryptographically signed packet to remove users from device denylists.
   *
   * @param entries - Array of users to remove from denylist (only 'sub' field required)
   * @param targetDeviceIds - Optional array of specific device IDs to target
   * @returns Promise resolving to tuple of [signed_payload, detached_signature]
   *
   * @throws Error if cryptographic signing fails
   */
  public static async buildDenylistRemove(entries: DenylistEntry[], targetDeviceIds?: string[]): Promise<[Record<string, any>, string]> {
    const payload: any = { cmd_type: 'DENYLIST_REMOVE', denylist_remove: entries };
    if (targetDeviceIds && targetDeviceIds.length > 0) {
      payload.targets = { device_ids: targetDeviceIds };
    }
    const { payload: p, signature } = await Ed25519Service.signPacket(payload);
    return [p, signature];
  }
}


