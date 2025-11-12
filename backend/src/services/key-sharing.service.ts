import { DatabaseService } from '@/services/database.service';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UserModel, User } from '@/models/user.model';
import { FirstTimeUserService } from '@/services/first-time-user.service';
import { logger } from '@/utils/logger';

export class KeySharingService {
  private static instance: KeySharingService;
  private db = DatabaseService.getInstance().connection;
  private keySharings = new KeySharingModel();

  public static getInstance(): KeySharingService {
    if (!KeySharingService.instance) {
      KeySharingService.instance = new KeySharingService();
    }
    return KeySharingService.instance;
  }

  /**
   * Invite a user by phone and create or activate a key sharing for a unit.
   * Assumes caller has already validated authorization.
   */
  public async inviteByPhone(params: {
    unitId: string;
    phoneE164: string;
    accessLevel: 'full' | 'limited' | 'temporary';
    expiresAt?: Date | null;
    grantedBy: string;
    primaryTenantIdFallback?: string;
  }): Promise<{ shareId: string; invitee: User; createdUser: boolean; }>
  {
    const { unitId, phoneE164, accessLevel, expiresAt, grantedBy, primaryTenantIdFallback } = params;

    // Find or create invitee by phone
    let invitee = await UserModel.findByPhone(phoneE164) as User | undefined;
    let createdUser = false;
    if (!invitee) {
      const created = await UserModel.create({
        login_identifier: phoneE164.toLowerCase(),
        email: null,
        phone_number: phoneE164,
        password_hash: '!',
        first_name: '',
        last_name: '',
        role: 'tenant',
        is_active: true,
        requires_password_reset: true,
      }) as User;
      invitee = created;
      createdUser = true;
      try {
        await FirstTimeUserService.getInstance().sendInvite(invitee);
      } catch (e) {
        logger.error('Failed to dispatch invite SMS', e);
      }
    }

    // Create or reactivate sharing
    const existing = await this.keySharings.getUnitSharedKeys(unitId, {
      shared_with_user_id: invitee.id,
    });

    let shareId: string;
    let isActive: boolean;
    let effectiveExpiresAt: Date | null | undefined;

    if (existing.sharings.length > 0) {
      const current = existing.sharings[0];
      const updated = await this.keySharings.update(current.id, {
        is_active: true,
        access_level: accessLevel,
        expires_at: expiresAt ?? undefined,
        granted_by: grantedBy,
      });
      shareId = (updated?.id || current.id);
      isActive = true;
      effectiveExpiresAt = updated?.expires_at ?? current.expires_at;
    } else {
      // Resolve primary tenant for record keeping
      let primaryTenantId = primaryTenantIdFallback || grantedBy;
      if (!primaryTenantIdFallback) {
        const primary = await this.db('unit_assignments').where({ unit_id: unitId, is_primary: true }).first();
        if (primary?.tenant_id) primaryTenantId = primary.tenant_id;
      }

      const created = await this.keySharings.create({
        unit_id: unitId,
        primary_tenant_id: primaryTenantId,
        shared_with_user_id: invitee.id,
        access_level: accessLevel,
        expires_at: expiresAt ?? undefined,
        granted_by: grantedBy,
      });
      shareId = created.id;
      isActive = true;
      effectiveExpiresAt = created.expires_at;
    }

    // ---- Denylist removal on (re)grant for active/unexpired share (Flow H) ----
    try {
      // Only when share is active and (no expiry or future)
      const now = new Date();
      const unexpired = !effectiveExpiresAt || effectiveExpiresAt > now;
      if (isActive && unexpired) {
        const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
        const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
        const { DenylistService } = await import('@/services/denylist.service');
        const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');

        const denylistModel = new DenylistEntryModel();
        // Find entries on devices of this unit for this invitee
        const entries = await denylistModel.findByUnitsAndUser([unitId], invitee.id);
        if (entries.length > 0) {
          // Facility for routing
          const unit = await this.db('units').where('id', unitId).first('facility_id');
          if (unit) {
            // Which entries still require a command?
            const entriesToProcess = entries.filter(e => !DenylistOptimizationService.shouldSkipDenylistRemove(e));

            // Always clean DB entries
            for (const e of entries) {
              await denylistModel.remove(e.device_id, invitee.id);
            }

            // Send command only if any non-expired entries remained
            if (entriesToProcess.length > 0) {
              const deviceIds = entries.map(e => e.device_id);
              const packet = await DenylistService.buildDenylistRemove([{ sub: invitee.id, exp: 0 }], deviceIds);
              GatewayEventsService.getInstance().unicastToFacility(unit.facility_id, packet);
            }
          }
        }
      }
    } catch (e) {
      logger.error('Failed to process denylist removal on invite grant:', e);
    }

    return { shareId, invitee, createdUser };
  }
}


