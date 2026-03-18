import { randomUUID } from 'crypto';
import { ActivityService, ActivityLogResponse } from '@/services/activity.service';
import { UnitModel } from '@/models/unit.model';
import { DeviceModel } from '@/models/device.model';
import { ValidationError } from '@/middleware/error.middleware';
import {
  AccessEventPayload,
  AccessEventDenialReason,
} from '@/services/access/access-event.types';

type IngestContext = {
  facilityId: string;
  source: 'gateway_internal_api';
};

const REDACTED = '***REDACTED***';

const denialReasonToResultMessage: Record<AccessEventDenialReason, string> = {
  out_of_schedule: 'Access denied: out of schedule window',
  route_pass_expired: 'Access denied: route pass expired',
  route_pass_invalid_signature: 'Access denied: invalid route pass signature',
  route_pass_wrong_lock: 'Access denied: route pass not valid for lock',
  internal_error: 'Access denied: internal processing error',
  denylist_blocked: 'Access denied: actor/device on denylist',
  insufficient_permissions: 'Access denied: insufficient permissions',
  invalid_credential: 'Access denied: invalid credential',
  unknown_error: 'Access denied: unknown error',
  other: 'Access denied',
};

export class AccessEventIngestionService {
  private readonly activityService = ActivityService.getInstance();
  private readonly unitModel = new UnitModel();
  private readonly deviceModel = new DeviceModel();

  public async ingestMany(events: AccessEventPayload[], context: IngestContext): Promise<ActivityLogResponse[]> {
    const writes: ActivityLogResponse[] = [];
    for (const event of events) {
      const log = await this.ingestOne(event, context);
      writes.push(log);
    }
    return writes;
  }

  public async ingestOne(event: AccessEventPayload, context: IngestContext): Promise<ActivityLogResponse> {
    await this.assertFacilityEntityConsistency(event, context.facilityId);

    const sanitizedMetadata: Record<string, unknown> = {
      ingestion_source: context.source,
      event_id: event.event_id || randomUUID(),
      correlation_id: event.correlation_id || null,
      action: event.action,
      method: event.method,
      denial_reason: event.denial_reason || null,
      reason_message: event.reason_message || null,
      actor: event.actor || null,
      route_pass: event.route_pass || null,
      keypad: this.sanitizeKeypad(event.keypad),
      metadata: event.metadata || {},
    };

    const title = this.buildTitle(event);
    const description = this.buildDescription(event);
    const actorType = event.actor?.role === 'gateway' ? 'gateway' : event.actor?.role === 'system' ? 'system' : 'user';
    const actorRole = event.actor?.role || 'unknown';
    const occurredAt = new Date(event.occurred_at);
    const result = event.success ? 'success' : 'failure';
    const resultMessage = event.success
      ? undefined
      : event.reason_message || (event.denial_reason ? denialReasonToResultMessage[event.denial_reason] : 'Access denied');

    return this.activityService.logActivity({
      entityType: 'device',
      entityId: event.device_id,
      activityType: 'access_attempt',
      title,
      description,
      actorType,
      actorId: event.actor?.user_id,
      actorName: event.actor?.name,
      result,
      resultMessage,
      facilityId: context.facilityId,
      unitId: event.unit_id,
      deviceId: event.device_id,
      occurredAt,
      metadata: {
        ...sanitizedMetadata,
        actor_role: actorRole,
        gateway_id: event.gateway_id || null,
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
      return denialReasonToResultMessage[event.denial_reason];
    }
    return 'Access denied';
  }

  private async assertFacilityEntityConsistency(event: AccessEventPayload, facilityId: string): Promise<void> {
    if (event.facility_id !== facilityId) {
      throw new ValidationError('facility_id must match scoped facility');
    }

    if (event.unit_id) {
      const unit = await this.unitModel.findById(event.unit_id);
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
    } catch {
      // Device enrichment should not block ingestion when the lookup layer is unavailable.
    }
  }
}
