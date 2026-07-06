import { GatewayModel } from '@/models/gateway.model';
import type { AccessControlDevice, DeviceWithContext } from '@/models/device.model';
import {
  AccessControlReachabilityFields,
  AccessControlReachabilitySource,
  BluLokReachabilityFields,
  BluLokReachabilitySource,
  FacilityDeviceHierarchyEnrichmentInput,
  NetworkInfraReachabilityFields,
  NetworkInfraReachabilitySource,
  UnitReachabilityFields,
  UnitReachabilitySource,
} from '@/types/device-reachability.types';
import {
  DeviceReachabilityResult,
  GatewayLivenessInput,
  resolveEffectiveAccessControlStatus,
  resolveEffectiveBluLokDeviceStatus,
  resolveEffectiveInfraStatus,
  isBluLokDeviceOnlineForDisplay,
} from '@/utils/device-reachability.utils';

type FacilityLivenessCache = Map<string, GatewayLivenessInput>;

function resolveFacilityId(
  explicitId: string | null | undefined,
  row: { facility_id?: string | null; gateway_facility_id?: string | null },
): string {
  return String(explicitId ?? row.facility_id ?? row.gateway_facility_id ?? '');
}

function withFacilityId<T extends AccessControlReachabilitySource | BluLokReachabilitySource>(
  row: T,
  facilityId: string,
): T {
  if (!facilityId || row.facility_id) {
    return row;
  }
  return { ...row, facility_id: facilityId };
}

/**
 * Enriches device rows for operator-facing API/WS responses.
 * Never import from sync, snapshot, or gateway ingest paths.
 */
export class DeviceReachabilityEnrichmentService {
  private static instance?: DeviceReachabilityEnrichmentService;
  private gatewayModel: GatewayModel;

  private constructor(gatewayModel?: GatewayModel) {
    this.gatewayModel = gatewayModel ?? new GatewayModel();
  }

  static getInstance(): DeviceReachabilityEnrichmentService {
    if (!DeviceReachabilityEnrichmentService.instance) {
      DeviceReachabilityEnrichmentService.instance = new DeviceReachabilityEnrichmentService();
    }
    return DeviceReachabilityEnrichmentService.instance;
  }

  /** Test hook — reset singleton. */
  static resetForTests(): void {
    DeviceReachabilityEnrichmentService.instance = undefined;
  }

  async createLivenessCache(): Promise<FacilityLivenessCache> {
    return new Map();
  }

  async resolveLivenessForFacility(
    facilityId: string | null | undefined,
    cache: FacilityLivenessCache,
  ): Promise<GatewayLivenessInput> {
    if (!facilityId) {
      return { dbStatus: 'offline', connected: null };
    }

    const cached = cache.get(facilityId);
    if (cached) return cached;

    let dbStatus: GatewayLivenessInput['dbStatus'] = 'offline';
    try {
      const gw = await this.gatewayModel.findByFacilityId(facilityId);
      if (gw?.status) {
        dbStatus = gw.status;
      }
    } catch {
      // fall through — treat as offline DB status
    }

    let connected: boolean | null = null;
    try {
      const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
      const conn = GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId);
      connected = conn.connected;
    } catch {
      connected = null;
    }

    const liveness: GatewayLivenessInput = { dbStatus, connected };
    cache.set(facilityId, liveness);
    return liveness;
  }

  /** Pre-seed liveness when hierarchy already includes gateway status. */
  private async seedLivenessFromHierarchyGateway(
    facilityId: string,
    gateway: { status?: string } | null | undefined,
    cache: FacilityLivenessCache,
  ): Promise<void> {
    if (!facilityId || !gateway?.status || cache.has(facilityId)) {
      return;
    }

    let connected: boolean | null = null;
    try {
      const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
      connected = GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId).connected;
    } catch {
      connected = null;
    }

    cache.set(facilityId, { dbStatus: gateway.status, connected });
  }

  async enrichBluLokRow<T extends BluLokReachabilitySource>(
    row: T,
    cache: FacilityLivenessCache,
    facilityIdOverride?: string | null,
  ): Promise<T & BluLokReachabilityFields> {
    const facilityId = resolveFacilityId(facilityIdOverride, row);
    const liveness = await this.resolveLivenessForFacility(facilityId || null, cache);
    const reported = String(row.reported_device_status ?? row.device_status ?? 'offline');
    const result = resolveEffectiveBluLokDeviceStatus(reported, liveness);
    return {
      ...row,
      device_status: result.effective,
      reported_device_status: result.reported,
      status_unreachable_reason: result.status_unreachable_reason,
    };
  }

  async enrichAccessControlRow<T extends AccessControlReachabilitySource>(
    row: T,
    cache: FacilityLivenessCache,
    facilityIdOverride?: string | null,
  ): Promise<T & AccessControlReachabilityFields> {
    const facilityId = resolveFacilityId(facilityIdOverride, row);
    const liveness = await this.resolveLivenessForFacility(facilityId || null, cache);
    const reported = String(row.reported_status ?? row.status ?? 'offline');
    const result = resolveEffectiveAccessControlStatus(reported, liveness);
    return {
      ...row,
      status: result.effective,
      reported_status: result.reported,
      status_unreachable_reason: result.status_unreachable_reason,
    };
  }

  async enrichNetworkInfraRow<T extends NetworkInfraReachabilitySource>(
    row: T,
    cache: FacilityLivenessCache,
    facilityIdOverride?: string | null,
  ): Promise<T & NetworkInfraReachabilityFields> {
    if (row.device_kind === 'gateway') {
      const status = String(row.status ?? 'offline');
      return {
        ...row,
        status,
        reported_status: status,
        status_unreachable_reason: null,
      };
    }

    const facilityId = resolveFacilityId(facilityIdOverride, row);
    const liveness = await this.resolveLivenessForFacility(facilityId || null, cache);
    const result = resolveEffectiveInfraStatus(row.state ?? null, liveness);
    return {
      ...row,
      status: result.effective,
      reported_status: result.reported,
      status_unreachable_reason: result.status_unreachable_reason,
    };
  }

  async enrichBluLokList<T extends BluLokReachabilitySource>(
    rows: T[],
    cache?: FacilityLivenessCache,
    facilityIdOverride?: string | null,
  ): Promise<Array<T & BluLokReachabilityFields>> {
    const livenessCache = cache ?? (await this.createLivenessCache());
    return Promise.all(rows.map((row) => this.enrichBluLokRow(row, livenessCache, facilityIdOverride)));
  }

  async enrichAccessControlList<T extends AccessControlReachabilitySource>(
    rows: T[],
    cache?: FacilityLivenessCache,
    facilityIdOverride?: string | null,
  ): Promise<Array<T & AccessControlReachabilityFields>> {
    const livenessCache = cache ?? (await this.createLivenessCache());
    return Promise.all(
      rows.map((row) => this.enrichAccessControlRow(row, livenessCache, facilityIdOverride)),
    );
  }

  async enrichNetworkInfraList<T extends NetworkInfraReachabilitySource>(
    rows: T[],
    cache?: FacilityLivenessCache,
    facilityIdOverride?: string | null,
  ): Promise<Array<T & NetworkInfraReachabilityFields>> {
    const livenessCache = cache ?? (await this.createLivenessCache());
    return Promise.all(
      rows.map((row) => this.enrichNetworkInfraRow(row, livenessCache, facilityIdOverride)),
    );
  }

  async enrichUnitRow<T extends UnitReachabilitySource>(
    row: T,
    cache: FacilityLivenessCache,
  ): Promise<T | (T & UnitReachabilityFields)> {
    if (!row.device_status && !row.blulok_device) {
      return row;
    }

    const facilityId = resolveFacilityId(undefined, row);
    const liveness = await this.resolveLivenessForFacility(facilityId || null, cache);
    const reported = String(
      row.reported_device_status ??
        row.device_status ??
        row.blulok_device?.device_status ??
        'offline',
    );
    const result = resolveEffectiveBluLokDeviceStatus(reported, liveness);

    const enrichedBlulok =
      row.blulok_device != null
        ? {
            ...row.blulok_device,
            device_status: result.effective,
            reported_device_status: result.reported,
            status_unreachable_reason: result.status_unreachable_reason,
          }
        : row.blulok_device;

    return {
      ...row,
      device_status: result.effective,
      reported_device_status: result.reported,
      status_unreachable_reason: result.status_unreachable_reason,
      is_online: isBluLokDeviceOnlineForDisplay(result.effective),
      blulok_device: enrichedBlulok ?? null,
    };
  }

  async enrichUnitList<T extends UnitReachabilitySource>(
    rows: T[],
    cache?: FacilityLivenessCache,
  ): Promise<Array<Awaited<ReturnType<DeviceReachabilityEnrichmentService['enrichUnitRow']>>>> {
    const livenessCache = cache ?? (await this.createLivenessCache());
    return Promise.all(rows.map((row) => this.enrichUnitRow(row, livenessCache)));
  }

  /** Post-enrichment status filter for list endpoints. */
  matchesEffectiveStatus(
    row: BluLokReachabilitySource | AccessControlReachabilitySource | NetworkInfraReachabilitySource,
    filterStatus: string,
    category?: string,
  ): boolean {
    if (category === 'network_infra' || ('device_kind' in row && row.device_kind != null)) {
      const status = 'status' in row ? row.status : undefined;
      return String(status ?? '') === filterStatus;
    }
    if (category === 'access_control') {
      const status = 'status' in row ? row.status : undefined;
      return String(status ?? '') === filterStatus;
    }
    if ('device_status' in row) {
      return String(row.device_status ?? '') === filterStatus;
    }
    const status = 'status' in row ? row.status : undefined;
    return String(status ?? '') === filterStatus;
  }

  /** Enrich operator-facing facility hierarchy payloads (REST only). */
  async enrichFacilityDeviceHierarchy(
    hierarchy: FacilityDeviceHierarchyEnrichmentInput,
  ): Promise<{
    facility: FacilityDeviceHierarchyEnrichmentInput['facility'];
    gateway: FacilityDeviceHierarchyEnrichmentInput['gateway'];
    accessControlDevices: Array<AccessControlDevice & AccessControlReachabilityFields>;
    blulokDevices: Array<DeviceWithContext & BluLokReachabilityFields>;
  }> {
    const cache = await this.createLivenessCache();
    const facilityId = hierarchy.facility?.id ?? hierarchy.gateway?.facility_id ?? '';
    await this.seedLivenessFromHierarchyGateway(facilityId, hierarchy.gateway, cache);

    const accessControlDevices = (hierarchy.accessControlDevices ?? []).map((row) =>
      withFacilityId(row, facilityId),
    );
    const blulokDevices = (hierarchy.blulokDevices ?? []).map((row) => withFacilityId(row, facilityId));

    const [enrichedAccessControl, enrichedBlulok] = await Promise.all([
      this.enrichAccessControlList(accessControlDevices, cache, facilityId || null),
      this.enrichBluLokList(blulokDevices, cache, facilityId || null),
    ]);

    return {
      facility: hierarchy.facility,
      gateway: hierarchy.gateway,
      accessControlDevices: enrichedAccessControl,
      blulokDevices: enrichedBlulok,
    };
  }
}

export type { FacilityLivenessCache };
