import {
  GatewayTelemetryLogModel,
  GatewayTelemetryLogRecord,
  GatewayTelemetryLogListFilters,
} from '@/models/gateway-telemetry-log.model';
import { parseGatewayTelemetryLogLine } from '@/utils/gateway-telemetry-log.parser';
import { SubscriptionRegistry } from '@/services/subscriptions/subscription-registry';
import { GatewayTelemetryLogSubscriptionManager } from '@/services/subscriptions/gateway-telemetry-log-subscription-manager';
import { GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH } from '@/constants/gateway-telemetry-log.constants';

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
    return this.model.listByGateway(gatewayId, filters, options);
  }

  broadcast(entries: GatewayTelemetryLogRecord[]): void {
    if (entries.length === 0) return;
    const manager = this.subscriptionRegistry?.getManager(
      'gateway_telemetry_logs',
    ) as GatewayTelemetryLogSubscriptionManager | undefined;
    manager?.broadcastUpdate(entries);
  }
}
