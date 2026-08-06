import { randomUUID } from 'crypto';
import { ActivityService, ActivityLogResponse } from '@/services/activity.service';
import { UnitModel } from '@/models/unit.model';
import { DeviceModel } from '@/models/device.model';
import { ValidationError } from '@/middleware/error.middleware';
import {
  AccessEventPayload,
  AccessEventDenialReason,
  AccessEventDeviceType,
} from '@/services/access/access-event.types';
import {
  AccessEventEntityResolverService,
  coerceAccessEventDeviceType,
} from '@/services/access/access-event-entity-resolver.service';
import { DENIAL_REASON_MESSAGES } from '@/constants/access-history.constants';
import { isOccupiedUnlockIntentAccessMethod } from '@/constants/occupied-unlock-intent.constants';
import { coerceOptionalAccessId } from '@/utils/access-event-placeholder.utils';
import { AccessSessionService } from '@/services/access/access-session.service';

type IngestContext = {
  facilityId: string;
  source: 'gateway_internal_api';
};

const REDACTED = '***REDACTED***';

function denialReasonToResultMessage(reason: AccessEventDenialReason): string {
  const label = DENIAL_REASON_MESSAGES[reason];
  if (label) {
    return `Access denied: ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  }
  return 'Access denied';
}

/**
 * Ingests gateway access-events into activity_logs and access_sessions.
 * Grant coalescing replaces the old "skip while pending remote unlock" suppression.
 */
export class AccessEventIngestionService {
  private readonly activityService = ActivityService.getInstance();
  private readonly unitModel = new UnitModel();
  private readonly deviceModel = new DeviceModel();
  private readonly entityResolver = new AccessEventEntityResolverService();

  public async ingestMany(events: AccessEventPayload[], context: IngestContext): Promise<ActivityLogResponse[]> {
    const writes: ActivityLogResponse[] = [];
    for (const event of events) {
      const log = await this.ingestOne(event, context);
      if (log) writes.push(log);
    }
    return writes;
  }

  public async ingestOne(event: AccessEventPayload, context: IngestContext): Promise<ActivityLogResponse | null> {
    const { event: resolved, deviceType: resolvedDeviceType } = await this.entityResolver.resolve(
      event,
      context.facilityId,
    );
    await this.assertFacilityEntityConsistency(resolved, context.facilityId);

    const deviceType = await this.resolveStoredDeviceType(
      resolvedDeviceType,
      resolved.device_type ?? coerceAccessEventDeviceType(event.device_type),
      resolved.device_id,
    );

    const sanitizedMetadata: Record<string, unknown> = {
      ingestion_source: context.source,
      event_id: resolved.event_id || randomUUID(),
      correlation_id: resolved.correlation_id || null,
      action: resolved.action,
      method: resolved.method,
      denial_reason: resolved.denial_reason || null,
      reason_message: resolved.reason_message || null,
      actor: resolved.actor || null,
      route_pass: resolved.route_pass || null,
      keypad: this.sanitizeKeypad(resolved.keypad),
      metadata: resolved.metadata || {},
      device_type: deviceType,
    };

    let occupiedOverride: {
      reason: string;
      reasonLabel: string;
      notes?: string;
    } | null = null;

    if (
      resolved.success
      && resolved.action === 'access_granted'
      && isOccupiedUnlockIntentAccessMethod(resolved.method)
      && resolved.actor?.user_id
    ) {
      const { OccupiedUnlockIntentService } = await import(
        '@/services/occupied-unlock-intent.service'
      );
      const intentIdRaw = resolved.metadata?.occupied_unlock_intent_id;
      const intentIdFromMetadata =
        typeof intentIdRaw === 'string' && intentIdRaw.trim().length > 0
          ? intentIdRaw.trim()
          : null;
      const consumed = OccupiedUnlockIntentService.getInstance().tryConsumeForAccessEvent({
        deviceId: resolved.device_id,
        userId: resolved.actor.user_id,
        intentIdFromMetadata,
      });
      if (consumed) {
        occupiedOverride = consumed.override;
        sanitizedMetadata.tenant_unlock_override = {
          reason: consumed.override.reason,
          reason_label: consumed.override.reasonLabel,
          notes: consumed.override.notes ?? null,
        };
        sanitizedMetadata.occupied_unit_override = true;
        sanitizedMetadata.occupied_unlock_intent_id = consumed.intentId;
      }
    }

    const title = this.buildTitle(resolved);
    let description = this.buildDescription(resolved);
    if (occupiedOverride?.reasonLabel) {
      description = [
        description,
        `Reason: ${occupiedOverride.reasonLabel}`,
        occupiedOverride.notes ? `Notes: ${occupiedOverride.notes}` : null,
      ].filter(Boolean).join('. ');
    }
    const actorType =
      resolved.actor?.role === 'gateway'
        ? 'gateway'
        : resolved.actor?.role === 'system'
          ? 'system'
          : 'user';
    const actorRole = resolved.actor?.role || 'unknown';
    const occurredAt = new Date(resolved.occurred_at);
    const result = resolved.success ? 'success' : 'failure';
    const resultMessage = resolved.success
      ? undefined
      : resolved.reason_message
        || (resolved.denial_reason ? denialReasonToResultMessage(resolved.denial_reason) : 'Access denied');

    const actor = {
      type: actorType as 'user' | 'system' | 'device' | 'gateway',
      id: resolved.actor?.user_id,
      name: resolved.actor?.name,
      role: actorRole,
    };

    const sessions = AccessSessionService.getInstance();
    const session = resolved.success
      ? await sessions.onGrantAccessEvent({
          facilityId: context.facilityId,
          deviceId: resolved.device_id,
          unitId: resolved.unit_id,
          gatewayId: resolved.gateway_id,
          deviceType,
          method: resolved.method,
          actor,
          correlationId: resolved.correlation_id,
          metadata: sanitizedMetadata,
          occurredAt,
        })
      : await sessions.onDenialAccessEvent({
          facilityId: context.facilityId,
          deviceId: resolved.device_id,
          unitId: resolved.unit_id,
          gatewayId: resolved.gateway_id,
          deviceType,
          method: resolved.method,
          actor,
          denialReason: resolved.denial_reason,
          reasonMessage: resultMessage,
          correlationId: resolved.correlation_id,
          metadata: sanitizedMetadata,
          occurredAt,
        });

    return this.activityService.logActivity({
      entityType: 'device',
      entityId: resolved.device_id,
      activityType: 'access_attempt',
      title,
      description,
      actorType,
      actorId: resolved.actor?.user_id,
      actorName: resolved.actor?.name,
      result,
      resultMessage,
      facilityId: context.facilityId,
      unitId: resolved.unit_id,
      deviceId: resolved.device_id,
      accessSessionId: session.id,
      occurredAt,
      metadata: {
        ...sanitizedMetadata,
        actor_role: actorRole,
        gateway_id: resolved.gateway_id || null,
      },
    });
  }

  private sanitizeKeypad(keypad: AccessEventPayload['keypad']): AccessEventPayload['keypad'] | null {
    if (!keypad) {
      return null;
    }
    return {
      ...keypad,
      entered_code: keypad.entered_code ? REDACTED : undefined,
    };
  }

  private buildTitle(event: AccessEventPayload): string {
    if (event.action === 'admin_remote_open') {
      return event.success ? 'Admin Remote Open' : 'Admin Remote Open Failed';
    }
    if (event.action === 'keypad_attempt') {
      return event.success ? 'Keypad Access Granted' : 'Keypad Access Denied';
    }
    return event.success ? 'Access Granted' : 'Access Denied';
  }

  private buildDescription(event: AccessEventPayload): string {
    if (event.success) {
      return `Access granted via ${event.method}`;
    }
    if (event.denial_reason) {
      return denialReasonToResultMessage(event.denial_reason);
    }
    return 'Access denied';
  }

  private async assertFacilityEntityConsistency(event: AccessEventPayload, facilityId: string): Promise<void> {
    if (event.facility_id !== facilityId) {
      throw new ValidationError('facility_id must match scoped facility');
    }

    const unitId = coerceOptionalAccessId(event.unit_id);
    if (unitId) {
      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        throw new ValidationError('unit_id not found');
      }
      if (unit.facility_id !== facilityId) {
        throw new ValidationError('unit_id does not belong to scoped facility');
      }
    }

    try {
      const [blulokDevice, acDevice] = await Promise.all([
        this.deviceModel.findBluLokDeviceById(event.device_id),
        this.deviceModel.findAccessControlDeviceWithGateway(event.device_id),
      ]);
      const deviceFacility = blulokDevice?.facility_id || acDevice?.facility_id || null;
      if (deviceFacility && deviceFacility !== facilityId) {
        throw new ValidationError('device_id does not belong to scoped facility');
      }
    } catch (err) {
      if (err instanceof ValidationError) throw err;
    }
  }

  private async resolveStoredDeviceType(
    resolvedDeviceType: AccessEventDeviceType | undefined,
    payloadHint: AccessEventDeviceType | undefined,
    deviceId: string,
  ): Promise<AccessEventDeviceType> {
    if (resolvedDeviceType) return resolvedDeviceType;
    if (payloadHint) return payloadHint;

    const [blulokDevice, acDevice] = await Promise.all([
      this.deviceModel.findBluLokDeviceById(deviceId),
      this.deviceModel.findAccessControlDeviceWithGateway(deviceId),
    ]);
    if (acDevice && !blulokDevice) return 'access_control';
    if (blulokDevice) return 'blulok';
    if (acDevice) return 'access_control';
    return 'blulok';
  }
}
