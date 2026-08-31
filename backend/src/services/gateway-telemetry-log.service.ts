import {
  GatewayTelemetryLogModel,
  GatewayTelemetryLogRecord,
  GatewayTelemetryLogListFilters,
} from '@/models/gateway-telemetry-log.model';
import { parseGatewayTelemetryLogLine } from '@/utils/gateway-telemetry-log.parser';
import { SubscriptionRegistry } from '@/services/subscriptions/subscription-registry';
import { GatewayTelemetryLogSubscriptionManager } from '@/services/subscriptions/gateway-telemetry-log-subscription-manager';
import { GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH } from '@/constants/gateway-telemetry-log.constants';
import { GATEWAY_TELEMETRY_CLOUD_SYSTEM_SOURCE } from '@/constants/gateway-telemetry-system-log.constants';
import { GATEWAY_TELEMETRY_LOG_RETENTION } from '@/constants/gateway-telemetry-log.constants';
import {
  buildGatewayTelemetrySystemLogPayload,
  filterRoutineGatewayWsReconnectLogs,
  type BuildGatewayTelemetrySystemLogInput,
} from '@/utils/gateway-telemetry-system-log.utils';
import { logger } from '@/utils/logger';

export class GatewayTelemetryLogService {
  private static instance: GatewayTelemetryLogService;
  private readonly model = new GatewayTelemetryLogModel();
  private subscriptionRegistry: SubscriptionRegistry | null = null;

  static getInstance(): GatewayTelemetryLogService {
    if (!GatewayTelemetryLogService.instance) {
      GatewayTelemetryLogService.instance = new GatewayTelemetryLogService();
    }
    return GatewayTelemetryLogService.instance;
  }

  setSubscriptionRegistry(registry: SubscriptionRegistry): void {
    this.subscriptionRegistry = registry;
  }

  async ingest(
    facilityId: string,
    gatewayId: string,
    rawLines: string[],
    source = 'gateway_ws',
  ): Promise<GatewayTelemetryLogRecord[]> {
    const trimmed = rawLines.map((line) => String(line ?? '').trim()).filter(Boolean);
    if (trimmed.length === 0) return [];

    const batch = trimmed.slice(0, GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH);
    const parsed = batch.map((line) => parseGatewayTelemetryLogLine(line));
    const rows = parsed.map((entry) => ({
      gateway_id: gatewayId,
      facility_id: facilityId,
      logged_at: entry.logged_at,
      payload: entry.payload,
      source,
    }));

    const created = await this.model.insertAndTrim(gatewayId, rows);
    this.broadcast(created);
    return created;
  }

  async list(
    gatewayId: string,
    filters: GatewayTelemetryLogListFilters,
    options: { limit?: number; offset?: number } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    // Load all rows matching filters (per-gateway retention cap) so reconnect-pair filtering
    // and pagination totals stay accurate.
    const { logs: rawLogs } = await this.model.listByGateway(gatewayId, filters, {
      limit: GATEWAY_TELEMETRY_LOG_RETENTION,
      offset: 0,
    });

    const filtered = filterRoutineGatewayWsReconnectLogs(rawLogs);
    const total = filtered.length;
    const logs = filtered.slice(offset, offset + limit);

    return { logs, total };
  }

  /**
   * Persist a cloud-originated operational line in the gateway telemetry log stream.
   * Payload uses the same header/message/data shape as gateway-ingested lines.
   */
  async recordSystemEvent(input: BuildGatewayTelemetrySystemLogInput): Promise<GatewayTelemetryLogRecord[]> {
    const loggedAt = new Date();
    const payload = buildGatewayTelemetrySystemLogPayload(input);
    const rows = [
      {
        gateway_id: input.gateway_id,
        facility_id: input.facility_id,
        logged_at: loggedAt,
        payload,
        source: GATEWAY_TELEMETRY_CLOUD_SYSTEM_SOURCE,
      },
    ];
    const created = await this.model.insertAndTrim(input.gateway_id, rows);
    this.broadcast(created);
    return created;
  }

  /** Non-blocking wrapper for lifecycle hooks; failures are logged only. */
  recordSystemEventSafe(input: BuildGatewayTelemetrySystemLogInput): void {
    void this.recordSystemEvent(input).catch((error) => {
      logger.warn(
        `Gateway telemetry system log failed event=${input.event} gateway=${input.gateway_id}`,
        error,
      );
    });
  }

  broadcast(entries: GatewayTelemetryLogRecord[]): void {
    if (entries.length === 0) return;
    const manager = this.subscriptionRegistry?.getManager(
      'gateway_telemetry_logs',
    ) as GatewayTelemetryLogSubscriptionManager | undefined;
    manager?.broadcastUpdate(entries);
  }
}
