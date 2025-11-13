import { DatabaseService } from '@/services/database.service';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UserModel, User } from '@/models/user.model';
import { FirstTimeUserService } from '@/services/first-time-user.service';
import { logger } from '@/utils/logger';
import { AuthService } from '@/services/auth.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { DenylistOptimizationService } from '@/services/denylist-optimization.service';
import { DenylistService } from '@/services/denylist.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { config } from '@/config/environment';
import { UserRole } from '@/types/auth.types';

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

  // ---- Refactor endpoints into service methods ----
  public async createShare(ctx: { userId: string; role: UserRole }, dto: {
    unit_id: string;
    shared_with_user_id: string;
    access_level?: 'full' | 'limited' | 'temporary' | 'permanent';
    expires_at?: Date | null;
    notes?: string;
    access_restrictions?: any;
  }): Promise<any> {
    const { unit_id, shared_with_user_id, access_level = 'limited', expires_at, notes, access_restrictions } = dto;
    // Normalize 'permanent' to 'limited' for model compatibility
    const normalizedLevel: 'full' | 'limited' | 'temporary' =
      access_level === 'permanent' ? 'limited' : (access_level as 'full' | 'limited' | 'temporary');

    if (ctx.role === UserRole.TENANT) {
      const hasAccess = await this.keySharings.checkUserHasAccess(ctx.userId, unit_id);
      if (!hasAccess) {
        throw new Error('You can only share keys for units you own');
      }
    } else if (!AuthService.canManageUsers(ctx.role)) {
      throw new Error('Insufficient permissions to share keys');
    }

    // Prevent duplicate active share
    const existingSharings = await this.keySharings.getUnitSharedKeys(unit_id, {
      shared_with_user_id,
      is_active: true
    });
    if (existingSharings.sharings.length > 0) {
      throw new Error('Key sharing already exists for this user and unit');
    }

    const sharingData = {
      unit_id,
      primary_tenant_id: ctx.userId,
      shared_with_user_id,
      access_level: normalizedLevel,
      expires_at: expires_at ?? null,
      granted_by: ctx.userId,
      notes,
      access_restrictions,
    };

    return await this.keySharings.create(sharingData);
  }

  public async updateShare(ctx: { userId: string; role: UserRole }, id: string, dto: {
    access_level?: 'full' | 'limited' | 'temporary' | 'permanent';
    expires_at?: Date | null;
    notes?: string;
    access_restrictions?: any;
    is_active?: boolean;
  }): Promise<any> {
    const existingSharing = await this.keySharings.findById(id);
    if (!existingSharing) {
      throw new Error('Key sharing record not found');
    }

    if (ctx.role === UserRole.TENANT) {
      if (existingSharing.primary_tenant_id !== ctx.userId) {
        throw new Error('You can only modify sharing for units you own');
      }
    } else if (!AuthService.canManageUsers(ctx.role)) {
      throw new Error('Insufficient permissions to modify key sharing');
    }

    const updateData: any = {};
    if (dto.access_level !== undefined) updateData.access_level = dto.access_level;
    if (dto.expires_at !== undefined) updateData.expires_at = dto.expires_at ? new Date(dto.expires_at) : null;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.access_restrictions !== undefined) updateData.access_restrictions = dto.access_restrictions;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;

    const updatedSharing = await this.keySharings.update(id, updateData);

    // Reactivation: remove invitee from denylist for this unit
    try {
      const newIsActive = (dto.is_active !== undefined)
        ? Boolean(dto.is_active)
        : (updatedSharing ? Boolean((updatedSharing as any).is_active) : Boolean((existingSharing as any).is_active));
      const becameActive = newIsActive && !Boolean((existingSharing as any).is_active);

      const effectiveExpiresAt: Date | null | undefined =
        (dto.expires_at !== undefined)
          ? (dto.expires_at ? new Date(dto.expires_at) : null)
          : (updatedSharing ? (updatedSharing as any).expires_at : (existingSharing as any).expires_at);

      const now = new Date();
      const unexpired = !effectiveExpiresAt || effectiveExpiresAt > now;

      if (becameActive && unexpired) {
        const denylistModel = new DenylistEntryModel();
        const entries = await denylistModel.findByUnitsAndUser([existingSharing.unit_id], existingSharing.shared_with_user_id);
        if (entries.length > 0) {
          const deviceIds = Array.from(new Set(entries.map(e => e.device_id)));
          const deviceFacilityRows = await this.db('blulok_devices as bd')
            .join('units as u', 'bd.unit_id', 'u.id')
            .whereIn('bd.id', deviceIds)
            .select('bd.id as device_id', 'u.facility_id');

          for (const e of entries) {
            await denylistModel.remove(e.device_id, existingSharing.shared_with_user_id);
          }

          const facilityToDeviceIds = new Map<string, string[]>();
          for (const row of deviceFacilityRows) {
            const list = facilityToDeviceIds.get(row.facility_id) || [];
            list.push(row.device_id);
            facilityToDeviceIds.set(row.facility_id, list);
          }

          for (const [facilityId, targetDeviceIds] of facilityToDeviceIds.entries()) {
            const entriesForFacility = entries.filter(e => targetDeviceIds.includes(e.device_id));
            const entriesToProcess = entriesForFacility.filter(e => !DenylistOptimizationService.shouldSkipDenylistRemove(e as any));
            if (entriesToProcess.length > 0) {
              const [payload] = await DenylistService.buildDenylistRemove([{ sub: existingSharing.shared_with_user_id, exp: 0 }], targetDeviceIds);
              GatewayEventsService.getInstance().unicastToFacility(facilityId, payload);
            }
          }
        }
      }
    } catch (e) {
      logger.error('Failed to process denylist removal on share reactivation:', e);
    }

    return updatedSharing;
  }

  public async revokeShare(ctx: { userId: string; role: UserRole }, id: string, performedBy: string): Promise<boolean> {
    const existingSharing = await this.keySharings.findById(id);
    if (!existingSharing) {
      throw new Error('Key sharing record not found');
    }
    if (ctx.role === UserRole.TENANT) {
      if (existingSharing.primary_tenant_id !== ctx.userId) {
        throw new Error('You can only revoke sharing for units you own');
      }
    } else if (!AuthService.canManageUsers(ctx.role)) {
      throw new Error('Insufficient permissions to revoke key sharing');
    }

    const success = await this.keySharings.revokeSharing(id);
    if (!success) return false;

    // Denylist invitee for this unit's devices (fire-and-forget)
    (async () => {
      try {
        const devices = await this.db('blulok_devices').where({ unit_id: existingSharing.unit_id }).select('id');
        const deviceIds = devices.map((d: any) => d.id);
        if (deviceIds.length === 0) return;

        const unit = await this.db('units').where('id', existingSharing.unit_id).first('facility_id');
        if (!unit) return;

        const now = new Date();
        const ttlMs = (config.security.routePassTtlHours || 24) * 60 * 60 * 1000;
        const expiresAt = new Date(now.getTime() + ttlMs);
        const exp = Math.floor(expiresAt.getTime() / 1000);
        const denylistModel = new DenylistEntryModel();

        for (const deviceId of deviceIds) {
          await denylistModel.create({
            device_id: deviceId,
            user_id: existingSharing.shared_with_user_id,
            expires_at: expiresAt,
            source: 'key_sharing_revocation',
            created_by: performedBy,
          });
        }

        const shouldSkip = await DenylistOptimizationService.shouldSkipDenylistAdd(existingSharing.shared_with_user_id);
        if (!shouldSkip) {
          const packet = await DenylistService.buildDenylistAdd([{ sub: existingSharing.shared_with_user_id, exp }], deviceIds);
          GatewayEventsService.getInstance().unicastToFacility(unit.facility_id, packet);
        }
      } catch (error) {
        logger.error('Failed to push denylist on key sharing revocation:', error);
      }
    })().catch(() => {});

    return true;
  }
}


