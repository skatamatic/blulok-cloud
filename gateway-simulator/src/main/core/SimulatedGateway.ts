import { randomUUID } from 'crypto';
import { DEFAULT_BEHAVIOR, type BehaviorConfig, type ConnectionStatus, type GatewayEventEntry, type GatewayInstanceState, normalizeBehavior } from '@protocol/ipc-channels';
import { isInventorySyncRequestMessage, isPingMessage } from '@protocol/messages';
import { CommandRouter } from '../commands/CommandRouter';
import { DeviceRegistry, DeviceFactory } from '../devices/DeviceRegistry';
import { deviceKey } from '../devices/IDeviceModel';
import {
  buildDeviceRecordsMap,
  cloneSimState,
  createDefaultDeviceSimState,
  normalizeProfileDeviceRecords,
  rotateDeviceOperationsKey,
} from '../devices/device-simulator.utils';
import type { DeviceSimulatorState, SimulatedDeviceRecord, UpdateDeviceSimRequest } from '@protocol/device-simulator-state';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import { assertAddableInventoryKind, filterManagedInventoryDevices } from '@protocol/device-kinds';
import { resolveSimulatorGatewayFirmwareVersion } from './gateway-firmware.utils';
import type { AccessEventPayload, SimulateAccessEventRequest } from '@protocol/access-events';
import { FirmwareReceiver } from '../firmware/FirmwareReceiver';
import { InventorySnapshotReceiver } from '../inventory/InventorySnapshotReceiver';
import type { AuthOkMessage } from '@protocol/messages';
import { GatewayConnection, type GatewayConnectionOptions } from '../net/GatewayConnection';
import type { ITransport } from '../net/ITransport';
import { ProxyClient } from '../net/ProxyClient';
import { operationalSyncBlockedHint, parseProxyError, type SyncResult } from '../net/proxy-result';
import { retryOperationalSync } from '../net/operational-sync-retry.utils';
import {
  expectedSyncDeferralMessage,
  isExpectedSyncDeferral,
} from '../net/expected-sync-deferral.utils';
import type { GatewayConnection } from '../net/GatewayConnection';
import type { OperationalDeviceDenylistSync } from '../devices/denylist-sync.utils';
import type { FileStateStore, GatewayProfile } from '../persistence/FileStateStore';
import { AUTO_RECONNECT_DELAY_MS } from './reconnect.constants';

export type GatewayTransport = ITransport & {
  getAuthOk(): AuthOkMessage | null;
};

export type SimulatedGatewayOptions = {
  id: string;
  label: string;
  backendUrl: string;
  facilityId: string;
  facilityName?: string;
  gatewayId: string;
  gatewayName?: string;
  gatewaySerial?: string;
  /** Persisted simulator gateway firmware — sent on WS AUTH as firmware_version. */
  gatewayFirmwareVersion?: string;
  token: string;
  devices?: DeviceInventoryItem[];
  deviceRecords?: SimulatedDeviceRecord[];
  behavior?: BehaviorConfig;
  /** Restored from disk — reconnect on app launch when autoReconnect is enabled. */
  connectOnRestore?: boolean;
  store: FileStateStore;
  onUpdate: (state: GatewayInstanceState) => void;
  onLog: (entry: GatewayEventEntry) => void;
  /** Test seam — override WebSocket transport (defaults to GatewayConnection). */
  createTransport?: (options: GatewayConnectionOptions) => GatewayTransport;
};

export class SimulatedGateway {
  readonly id: string;
  private label: string;
  private backendUrl: string;
  private facilityId: string;
  private facilityName?: string;
  private gatewayId: string;
  private gatewayName?: string;
  private gatewaySerial?: string;
  private gatewayFirmwareVersion: string;
  private token: string;
  private behavior: BehaviorConfig;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private lastError?: string;
  private connectionWarning?: string;
  private connectedAt?: string;
  private events: GatewayEventEntry[] = [];
  private connection: GatewayTransport | null = null;
  private proxy: ProxyClient | null = null;
  private registry = new DeviceRegistry();
  private firmware = new FirmwareReceiver();
  private inventory = new InventorySnapshotReceiver();
  private router = new CommandRouter(this.firmware, this.inventory);
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Persisted: reconnect this tab on next app launch when autoReconnect is on. */
  private connectOnRestore: boolean;
  /** Runtime: eligible for automatic reconnect after an unexpected drop (not manual disconnect). */
  private reconnectEligible = false;
  /** Cached operations public key (from AUTH_OK or key rotation). */
  private cachedOpsPublicKey?: string;
  private gatewaySecureTimeSyncAt?: string;
  private gatewaySecureTimeSyncTs?: number;
  private inventorySyncChain: Promise<void> = Promise.resolve();

  constructor(private readonly options: SimulatedGatewayOptions) {
    this.id = options.id;
    this.label = options.label;
    this.backendUrl = options.backendUrl;
    this.facilityId = options.facilityId;
    this.facilityName = options.facilityName;
    this.gatewayId = options.gatewayId;
    this.gatewayName = options.gatewayName;
    this.gatewaySerial = options.gatewaySerial;
    this.token = options.token;
    this.behavior = normalizeBehavior(options.behavior);
    this.connectOnRestore = options.connectOnRestore ?? false;
    this.registry.setCreateContext({ facilityId: this.facilityId, operationsKeyPublicB64: this.cachedOpsPublicKey });
    const records = normalizeProfileDeviceRecords(
      { facilityId: this.facilityId, devices: options.devices, deviceRecords: options.deviceRecords },
      this.cachedOpsPublicKey,
    );
    const legacyGateway = records.find((d) => d.item.kind === 'gateway');
    this.gatewayFirmwareVersion = resolveSimulatorGatewayFirmwareVersion({
      profileVersion: options.gatewayFirmwareVersion,
      legacyInventoryVersion:
        legacyGateway?.item.kind === 'gateway' ? legacyGateway.item.firmware_version : undefined,
    });
    if (records.length) {
      this.registry.load(records);
    }
  }

  getState(): GatewayInstanceState {
    const authOk = this.connection?.getAuthOk();
    return {
      id: this.id,
      label: this.label,
      backendUrl: this.backendUrl,
      facilityId: this.facilityId,
      facilityName: this.facilityName,
      gatewayId: this.gatewayId,
      gatewayName: this.gatewayName,
      gatewaySerial: this.gatewaySerial,
      gatewayFirmwareVersion: this.gatewayFirmwareVersion,
      connectionStatus: this.connectionStatus,
      sessionRole: authOk?.sessionRole,
      autoRegistered: authOk?.autoRegistered,
      opsPublicKey: authOk?.ops_public_key ?? this.cachedOpsPublicKey,
      devices: this.registry.list(),
      deviceSimByKey: buildDeviceRecordsMap(this.registry.exportRecords()),
      behavior: normalizeBehavior(this.behavior),
      events: [...this.events].slice(-200),
      lastError: this.lastError,
      connectionWarning: this.connectionWarning,
      connectedAt: this.connectedAt,
      reconnectAt: this.reconnectAt ?? undefined,
    };
  }

  private emitUpdate(): void {
    this.options.onUpdate(this.getState());
  }

  private log(direction: GatewayEventEntry['direction'], summary: string, payload?: unknown): void {
    const entry: GatewayEventEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      direction,
      summary,
      payload,
    };
    this.events.push(entry);
    if (this.events.length > 500) this.events.shift();
    this.options.onLog(entry);
    this.emitUpdate();
  }

  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected' || this.connectionStatus === 'connecting') return;
    this.clearReconnectSchedule();
    this.connectionStatus = 'connecting';
    this.lastError = undefined;
    this.connectionWarning = undefined;
    this.emitUpdate();

    try {
      const connectionOptions: GatewayConnectionOptions = {
        backendUrl: this.backendUrl,
        token: this.token,
        facilityId: this.facilityId,
        gatewayId: this.gatewayId,
        firmwareVersion: this.gatewayFirmwareVersion,
        onLog: (dir, summary, payload) => this.log(dir, summary, payload),
        onSessionRoleChanged: (auth, previousRole) => {
          if (previousRole === undefined) return;
          void this.handleSessionRoleChanged(auth);
        },
        onUnhealthy: (reason) => {
          this.handleConnectionLost(`Heartbeat failed (${reason})`, { markError: true });
        },
      };
      const createTransport =
        this.options.createTransport ?? ((options) => new GatewayConnection(options) as GatewayTransport);
      this.connection = createTransport(connectionOptions);

      this.proxy = new ProxyClient(this.connection);
      this.proxy.attach();

      this.connection.onMessage((msg) => void this.handleMessage(msg));
      this.connection.onClose(() => {
        this.handleConnectionLost('connection closed');
      });

      await this.connection.connect();
      this.connectionStatus = 'connected';
      const authOk = this.connection.getAuthOk();
      if (authOk?.ops_public_key) {
        this.cachedOpsPublicKey = authOk.ops_public_key;
        this.registry.setCreateContext({ facilityId: this.facilityId, operationsKeyPublicB64: this.cachedOpsPublicKey });
        this.registry.forEachSimState((_key, sim) => {
          if (!sim.operationsKeyRotatedAt) {
            sim.operationsKeyPublicB64 = authOk.ops_public_key!;
          }
        });
      }
      this.connectedAt = new Date().toISOString();
      this.reconnectEligible = true;
      this.connectOnRestore = true;
      this.log('system', 'Connected and authenticated');
      this.emitUpdate();

      await this.runPostConnectInventorySync(authOk?.sessionRole);

      this.startTelemetry();
      await this.persist();
    } catch (err) {
      this.connectionStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.connection?.disconnect();
      this.connection = null;
      this.proxy?.dispose();
      this.proxy = null;
      this.log('system', `Connection failed: ${this.lastError}`);
      this.emitUpdate();
      this.maybeScheduleReconnect('connection failed');
      throw err;
    }
  }

  disconnect(): void {
    this.reconnectEligible = false;
    this.connectOnRestore = false;
    this.clearReconnectSchedule();
    this.handleConnectionLost('manual disconnect', { scheduleReconnect: false });
  }

  private handleConnectionLost(
    reason: string,
    options?: { markError?: boolean; scheduleReconnect?: boolean },
  ): void {
    const scheduleReconnect = options?.scheduleReconnect ?? true;
    if (this.connectionStatus === 'disconnected' && !this.connection && !this.proxy) {
      return;
    }
    this.stopTelemetry();
    this.proxy?.dispose();
    this.connection?.disconnect();
    this.connection = null;
    this.proxy = null;
    this.connectionStatus = options?.markError ? 'error' : 'disconnected';
    if (options?.markError) {
      this.lastError = reason;
    } else if (reason === 'manual disconnect') {
      this.lastError = undefined;
    }
    this.connectionWarning = undefined;
    if (reason !== 'manual disconnect') {
      this.log('system', `Connection lost: ${reason}`);
    }
    void this.persist();
    this.emitUpdate();
    if (scheduleReconnect) {
      this.maybeScheduleReconnect(reason);
    }
  }

  private canOperationalSyncNow(): boolean {
    const role = this.connection?.getAuthOk()?.sessionRole;
    if (role === 'swap_candidate') return false;
    return role === 'active' || role === 'legacy' || role === undefined;
  }

  private async waitForSnapshotIdle(timeoutMs = 30_000): Promise<void> {
    const started = Date.now();
    while (this.inventory.isBusy() && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private runExclusiveInventorySync<T>(task: () => Promise<T>): Promise<T> {
    const run = this.inventorySyncChain.then(task, task);
    this.inventorySyncChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private clearReconnectSchedule(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAt = null;
  }

  private maybeScheduleReconnect(reason: string): void {
    if (!this.behavior.autoReconnect || !this.reconnectEligible) return;
    this.scheduleReconnect(reason);
  }

  private scheduleReconnect(reason: string): void {
    this.clearReconnectSchedule();
    this.reconnectAt = Date.now() + AUTO_RECONNECT_DELAY_MS;
    this.log('system', `Auto-reconnect in ${AUTO_RECONNECT_DELAY_MS / 1000}s (${reason})`);
    this.emitUpdate();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAt = null;
      this.emitUpdate();
      void this.connect().catch(() => undefined);
    }, AUTO_RECONNECT_DELAY_MS);
  }

  private async handleSessionRoleChanged(auth: AuthOkMessage): Promise<void> {
    const role = auth.sessionRole ?? 'unknown';
    this.log('system', `Session role updated: ${role}`, {
      sessionRole: auth.sessionRole,
      gatewayId: auth.gatewayId,
    });
    if (auth.sessionRole === 'active') {
      this.connectionWarning = undefined;
      await this.waitForSnapshotIdle();
      const sync = await retryOperationalSync(() => this.syncInventoryInternal());
      this.applyInventorySyncResult(sync, auth.sessionRole, 'role_change');
      this.emitUpdate();
    }
  }

  private async handleMessage(msg: unknown): Promise<void> {
    if (isPingMessage(msg) && this.behavior.respondToPing && this.connection) {
      this.connection.send({ type: 'PONG' });
      (this.connection as GatewayConnection).noteJsonPongSent?.();
      return;
    }

    if (isInventorySyncRequestMessage(msg)) {
      if (this.inventory.isBusy()) {
        this.log('system', 'Deferred INVENTORY_SYNC_REQUEST — snapshot apply in progress');
        return;
      }
      const role = this.connection?.getAuthOk()?.sessionRole;
      if (role === 'active' || role === 'legacy' || role === undefined) {
        const sync = await retryOperationalSync(() => this.syncInventoryInternal());
        this.applyInventorySyncResult(sync, role, 'request');
        this.emitUpdate();
      }
      return;
    }

    if (!this.proxy || !this.connection) return;

    const ctx = {
      transport: this.connection,
      proxy: this.proxy,
      registry: this.registry,
      behavior: this.behavior,
      facilityId: this.facilityId,
      onPersist: () => void this.persist(),
      onNotify: (event: { summary: string; payload?: unknown }) => this.log('system', event.summary, event.payload),
      onDevicesChanged: () => this.emitUpdate(),
      canOperationalSync: () => this.canOperationalSyncNow(),
      applyGatewayFirmware: (version: string) => {
        this.gatewayFirmwareVersion = version.trim();
        void this.persist();
      },
      applyOperationsKeyRotation: (newOpsPublicB64, ts) => {
        this.cachedOpsPublicKey = newOpsPublicB64;
        this.registry.setCreateContext({ facilityId: this.facilityId, operationsKeyPublicB64: newOpsPublicB64 });
        this.registry.forEachSimState((_key, sim) => {
          rotateDeviceOperationsKey(sim, newOpsPublicB64, ts);
        });
      },
      applySecureTimeSync: (ts) => {
        this.gatewaySecureTimeSyncTs = ts;
        this.gatewaySecureTimeSyncAt = new Date(ts * 1000).toISOString();
      },
      onAfterInventorySnapshotApplied: () => this.pullCloudDenylistAfterSnapshot(),
    };

    await this.router.route(msg, ctx);
  }

  async syncInventory(): Promise<void> {
    const result = await this.syncInventoryInternal();
    if (!result.ok) {
      this.connectionWarning = result.message;
      this.emitUpdate();
      throw new Error(result.message);
    }
    this.connectionWarning = undefined;
    this.emitUpdate();
  }

  private async runPostConnectInventorySync(sessionRole?: AuthOkMessage['sessionRole']): Promise<void> {
    if (sessionRole === 'swap_candidate') {
      this.connectionWarning = expectedSyncDeferralMessage(sessionRole);
      this.log('system', 'Connected as swap candidate — inventory sync skipped until promoted');
      this.emitUpdate();
      return;
    }

    const sync = await this.syncInventoryInternal();
    this.applyInventorySyncResult(sync, sessionRole, 'connect');
  }

  private applyInventorySyncResult(
    sync: SyncResult,
    sessionRole: AuthOkMessage['sessionRole'] | undefined,
    context: 'connect' | 'role_change' | 'request',
  ): void {
    if (sync.ok) {
      this.connectionWarning = undefined;
      return;
    }

    if (isExpectedSyncDeferral(sessionRole, sync)) {
      this.connectionWarning = expectedSyncDeferralMessage(sessionRole);
      this.log('system', `Inventory sync skipped (${context}): ${sync.message}`);
      return;
    }

    this.connectionWarning = sync.message;
    const hint = operationalSyncBlockedHint(sync);
    this.log('system', `Inventory sync deferred: ${sync.message}${hint}`, {
      status: sync.status,
      code: sync.code,
    });
  }

  private async syncInventoryInternal(): Promise<SyncResult> {
    return this.runExclusiveInventorySync(async () => {
      if (!this.proxy) return { ok: false, status: 0, message: 'Not connected' };
      const devices = [...this.registry.inventorySyncItems()];
      const res = await this.proxy.inventorySync(this.facilityId, devices);
      this.log('system', `Inventory sync HTTP ${res.status}`, res.body);
      if (res.status >= 400) {
        return parseProxyError(res);
      }

      const operationalDevices = this.extractOperationalDenylistSync(res.body);
      if (operationalDevices.length > 0) {
        const applied = this.registry.applyOperationalDenylistSync(operationalDevices);
        const totalEntries = operationalDevices.reduce((sum, row) => sum + row.denylist.length, 0);
        void this.persist();
        this.emitUpdate();
        if (applied > 0) {
          this.log('system', `Applied cloud denylist sync to ${applied} device(s) (${totalEntries} entries)`);
        } else {
          this.log('system', `Cloud returned ${operationalDevices.length} operational device(s) with denylist data but none matched local inventory`);
        }
      }

      return { ok: true, status: res.status };
    });
  }

  /** Inventory sync is blocked until recovery completes; retry briefly after snapshot apply. */
  private async pullCloudDenylistAfterSnapshot(): Promise<void> {
    await this.waitForSnapshotIdle();
    const sync = await retryOperationalSync(() => this.syncInventoryInternal());
    if (sync.ok) {
      this.connectionWarning = undefined;
    } else {
      this.connectionWarning = sync.message;
    }
    this.emitUpdate();
  }

  private extractOperationalDenylistSync(body: unknown): OperationalDeviceDenylistSync[] {
    if (!body || typeof body !== 'object') return [];
    const root = body as Record<string, unknown>;
    const payload = (root.data && typeof root.data === 'object' ? root.data : root) as {
      operational_devices?: unknown;
    };
    if (!Array.isArray(payload.operational_devices)) return [];
    return payload.operational_devices.filter((row): row is OperationalDeviceDenylistSync => {
      if (!row || typeof row !== 'object') return false;
      const candidate = row as OperationalDeviceDenylistSync;
      return typeof candidate.cloud_device_id === 'string'
        && (candidate.kind === 'lock' || candidate.kind === 'access_control')
        && typeof candidate.serial === 'string'
        && Array.isArray(candidate.denylist);
    });
  }

  async syncState(): Promise<void> {
    const result = await this.syncStateInternal();
    if (!result.ok) {
      this.connectionWarning = result.message;
      this.emitUpdate();
      throw new Error(result.message);
    }
    this.connectionWarning = undefined;
    this.emitUpdate();
  }

  private async syncStateInternal(): Promise<SyncResult> {
    if (!this.proxy) return { ok: false, status: 0, message: 'Not connected' };
    const updates = this.registry.stateUpdates();
    const res = await this.proxy.stateSync(this.facilityId, updates);
    this.log('system', `State sync HTTP ${res.status}`, res.body);
    if (res.status >= 400) {
      return parseProxyError(res);
    }
    return { ok: true, status: res.status };
  }

  private async syncDeviceState(key: string): Promise<void> {
    if (!this.proxy) return;
    const device = this.registry.get(key);
    if (!device) return;
    const updates = [device.toStateUpdate()];
    const res = await this.proxy.stateSync(this.facilityId, updates);
    this.log('system', `Live state sync HTTP ${res.status} (${key})`, res.body);
    if (res.status >= 400) {
      const result = parseProxyError(res);
      this.connectionWarning = result.message;
      this.emitUpdate();
      const hint = operationalSyncBlockedHint(result);
      throw new Error(`${result.message}${hint}`);
    }
  }

  private async syncLiveStateIfEnabled(key: string): Promise<void> {
    if (!this.behavior.liveStateSync || this.connectionStatus !== 'connected' || !this.proxy) return;
    try {
      await this.syncDeviceState(key);
    } catch (err) {
      this.log('system', `Live state sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async syncLiveInventoryIfEnabled(): Promise<void> {
    if (!this.behavior.liveStateSync || this.connectionStatus !== 'connected' || !this.proxy) {
      return;
    }
    try {
      const result = await this.syncInventoryInternal();
      if (!result.ok) {
        this.connectionWarning = result.message;
        const hint = operationalSyncBlockedHint(result);
        this.log('system', `Live inventory sync failed: ${result.message}${hint}`, {
          status: result.status,
          code: result.code,
        });
      } else {
        this.connectionWarning = undefined;
      }
    } catch (err) {
      this.log('system', `Live inventory sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.emitUpdate();
  }

  /** Push live-sync updates after undo/redo restores prior device fields or inventory. */
  async syncLiveAfterProfileRestore(previousDevices: DeviceInventoryItem[]): Promise<void> {
    if (!this.behavior.liveStateSync || this.connectionStatus !== 'connected' || !this.proxy) {
      return;
    }

    const currentDevices = filterManagedInventoryDevices(this.registry.list());
    if (SimulatedGateway.deviceListChanged(previousDevices, currentDevices)) {
      await this.syncLiveInventoryIfEnabled();
      return;
    }

    await this.syncLiveStateForChangedDevices(previousDevices);
  }

  private async syncLiveStateForChangedDevices(previousDevices: DeviceInventoryItem[]): Promise<void> {
    if (!this.behavior.liveStateSync || this.connectionStatus !== 'connected' || !this.proxy) {
      return;
    }

    const beforeByKey = new Map(
      filterManagedInventoryDevices(previousDevices).map((item) => [
        SimulatedGateway.deviceKeyForItem(item),
        SimulatedGateway.snapshotDeviceForCompare(item),
      ]),
    );

    for (const current of filterManagedInventoryDevices(this.registry.list())) {
      const key = SimulatedGateway.deviceKeyForItem(current);
      const before = beforeByKey.get(key);
      if (before === undefined) continue;
      if (before === SimulatedGateway.snapshotDeviceForCompare(current)) continue;
      await this.syncLiveStateIfEnabled(key);
    }
  }

  private static readonly LOCK_INVENTORY_PATCH_KEYS = new Set(['lock_number']);
  private static readonly ACCESS_INVENTORY_PATCH_KEYS = new Set([
    'relay_channel',
    'device_type',
    'name',
    'location_description',
  ]);

  private static shouldLiveSyncInventory(
    existing: DeviceInventoryItem,
    patch: Partial<DeviceInventoryItem> | undefined,
  ): boolean {
    if (!patch) return false;
    const nextItem = { ...existing, ...patch } as DeviceInventoryItem;
    if (deviceKey(nextItem) !== deviceKey(existing)) return true;
    const identityKeys = existing.kind === 'lock'
      ? SimulatedGateway.LOCK_INVENTORY_PATCH_KEYS
      : existing.kind === 'access_control'
        ? SimulatedGateway.ACCESS_INVENTORY_PATCH_KEYS
        : null;
    if (!identityKeys) return false;
    return Object.keys(patch).some((key) => identityKeys.has(key));
  }

  private async syncLiveAfterDeviceEdit(
    existing: DeviceInventoryItem,
    patch: Partial<DeviceInventoryItem> | undefined,
    stateKey: string,
  ): Promise<void> {
    if (SimulatedGateway.shouldLiveSyncInventory(existing, patch)) {
      await this.syncLiveInventoryIfEnabled();
      return;
    }
    await this.syncLiveStateIfEnabled(stateKey);
  }

  private static snapshotDeviceForCompare(item: DeviceInventoryItem): string {
    const { last_seen: _lastSeen, ...rest } = item as DeviceInventoryItem & { last_seen?: string };
    return JSON.stringify(rest);
  }

  private static deviceListChanged(
    previousDevices: DeviceInventoryItem[],
    currentDevices: DeviceInventoryItem[],
  ): boolean {
    const beforeKeys = new Set(
      filterManagedInventoryDevices(previousDevices).map((item) => SimulatedGateway.deviceKeyForItem(item)),
    );
    const afterKeys = new Set(
      filterManagedInventoryDevices(currentDevices).map((item) => SimulatedGateway.deviceKeyForItem(item)),
    );
    if (beforeKeys.size !== afterKeys.size) return true;
    for (const key of beforeKeys) {
      if (!afterKeys.has(key)) return true;
    }
    return false;
  }

  async addDevice(kind: DeviceInventoryItem['kind']): Promise<DeviceInventoryItem> {
    assertAddableInventoryKind(kind);
    this.registry.setCreateContext({
      facilityId: this.facilityId,
      operationsKeyPublicB64: this.cachedOpsPublicKey ?? this.connection?.getAuthOk()?.ops_public_key,
    });
    const record = this.registry.addDefault(kind, randomUUID().slice(0, 8));
    void this.persist();
    await this.syncLiveInventoryIfEnabled();
    this.emitUpdate();
    return record.item;
  }

  async updateDeviceSim(key: string, req: UpdateDeviceSimRequest): Promise<SimulatedDeviceRecord | null> {
    const existing = this.registry.getRecord(key);
    if (!existing) return null;

    const nextItem = req.inventoryPatch
      ? ({ ...existing.item, ...req.inventoryPatch } as DeviceInventoryItem)
      : existing.item;
    const nextSim = cloneSimState(existing.sim);

    if (req.simPatch) {
      const { errorCode, errorMessage, ...rest } = req.simPatch;
      Object.assign(nextSim, rest);
      if (errorCode !== undefined) nextSim.errorCode = errorCode;
      if (errorMessage !== undefined) nextSim.errorMessage = errorMessage;
    }
    if (req.denylist) {
      nextSim.denylist = req.denylist.map((row) => ({ ...row }));
    }
    if (req.accessCodes) {
      nextSim.accessCodes = req.accessCodes.map((row) => ({ ...row }));
    }

    if (req.simPatch?.errorCode !== undefined || req.simPatch?.errorMessage !== undefined) {
      if (nextItem.kind === 'lock' || nextItem.kind === 'access_control') {
        const operational = nextItem as { error_code?: string; error_message?: string };
        operational.error_code = nextSim.errorCode;
        operational.error_message = nextSim.errorMessage;
      }
    }

    const nextKey = deviceKey(nextItem);
    this.registry.replaceRecord(key, { item: nextItem, sim: nextSim });
    void this.persist();
    await this.syncLiveAfterDeviceEdit(existing.item, req.inventoryPatch, nextKey);
    this.emitUpdate();
    return this.registry.getRecord(nextKey) ?? null;
  }

  resetDeviceToDefaults(key: string): SimulatedDeviceRecord | null {
    const existing = this.registry.getRecord(key);
    if (!existing) return null;

    const defaults = DeviceFactory.createDefault(existing.item.kind, randomUUID().slice(0, 8), {
      facilityId: this.facilityId,
      operationsKeyPublicB64: this.cachedOpsPublicKey,
    });

    if (defaults.item.kind === 'lock' && existing.item.kind === 'lock') {
      defaults.item.lock_id = existing.item.lock_id;
      defaults.item.lock_number = existing.item.lock_number;
    } else if (defaults.item.kind === 'access_control' && existing.item.kind === 'access_control') {
      defaults.item.access_id = existing.item.access_id;
      defaults.item.relay_channel = existing.item.relay_channel;
    } else if (
      (defaults.item.kind === 'bridge' || defaults.item.kind === 'friend_node')
      && (existing.item.kind === 'bridge' || existing.item.kind === 'friend_node')
    ) {
      defaults.item.serial = existing.item.serial;
    }

    defaults.sim.facilityId = this.facilityId;
    defaults.sim.rootKeyPublicB64 = existing.sim.rootKeyPublicB64;
    this.registry.replaceRecord(key, defaults);
    void this.persist();
    this.emitUpdate();
    return defaults;
  }

  async updateDevice(key: string, patch: Partial<DeviceInventoryItem>): Promise<DeviceInventoryItem | null> {
    const existing = this.registry.getRecord(key);
    if (!existing) return null;
    const updated = this.registry.update(key, patch);
    if (!updated) return null;
    void this.persist();
    await this.syncLiveAfterDeviceEdit(existing.item, patch, deviceKey(updated.toInventoryItem()));
    this.emitUpdate();
    return updated.toInventoryItem();
  }

  getDeviceRecord(key: string): SimulatedDeviceRecord | null {
    return this.registry.getRecord(key) ?? null;
  }

  async unlockDevice(key: string): Promise<void> {
    const record = this.registry.getRecord(key);
    if (!record) return;
    if (record.item.kind === 'lock') {
      this.registry.update(key, { locked: false, state: 'OPENED' });
    } else if (record.item.kind === 'access_control') {
      this.registry.update(key, { locked: false, state: 'OPENED' });
    } else {
      return;
    }
    void this.persist();
    this.emitUpdate();
    await this.syncLiveStateIfEnabled(key);
  }

  async resolveCloudDeviceId(item: DeviceInventoryItem): Promise<string | null> {
    const resolved = await this.resolveCloudDevice(item);
    return resolved?.id ?? null;
  }

  async removeDevice(key: string): Promise<boolean> {
    const ok = this.registry.remove(key);
    if (ok) {
      void this.persist();
      await this.syncLiveInventoryIfEnabled();
      this.emitUpdate();
    }
    return ok;
  }

  clearDevices(): void {
    this.registry.clear();
    void this.persist();
    this.emitUpdate();
  }

  setBehavior(behavior: Partial<BehaviorConfig>): void {
    this.behavior = normalizeBehavior({ ...this.behavior, ...behavior });
    if (!this.behavior.autoReconnect) {
      this.clearReconnectSchedule();
    }
    if (this.behavior.periodicTelemetryMs > 0) {
      this.startTelemetry();
    } else {
      this.stopTelemetry();
    }
    void this.persist();
    this.emitUpdate();
  }

  resetState(): void {
    this.registry.clear();
    this.firmware.reset();
    this.behavior = { ...DEFAULT_BEHAVIOR };
    void this.persist();
    this.emitUpdate();
  }

  async simulateAccessEvent(req: SimulateAccessEventRequest): Promise<void> {
    if (!this.proxy) throw new Error('Not connected');
    const device = this.registry.get(req.deviceKey);
    if (!device) throw new Error('Device not found in local inventory');

    const item = device.toInventoryItem();
    if (item.kind !== 'lock' && item.kind !== 'access_control') {
      throw new Error('Access events are only supported for locks and access control devices');
    }

    const resolved = await this.resolveCloudDevice(item);
    if (!resolved) {
      throw new Error('Device not found in cloud — sync inventory first so the backend knows this device');
    }

    if (!req.success && !req.denial_reason) {
      throw new Error('denial_reason is required when success is false');
    }

    const event: AccessEventPayload = {
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      facility_id: this.facilityId,
      device_id: resolved.id,
      gateway_id: this.gatewayId,
      unit_id: req.unit_id ?? resolved.unit_id,
      action: req.action,
      method: req.method,
      success: req.success,
      denial_reason: req.denial_reason,
      actor: req.actor,
      keypad: req.keypad,
    };

    const res = await this.proxy.accessEvents(this.facilityId, [event]);
    this.log('system', `Access event HTTP ${res.status}`, { event, response: res.body });
    if (res.status >= 400) {
      const msg =
        typeof res.body === 'object' && res.body && 'message' in res.body
          ? String((res.body as { message: unknown }).message)
          : `HTTP ${res.status}`;
      throw new Error(`Access event rejected: ${msg}`);
    }
  }

  private async resolveCloudDevice(
    item: DeviceInventoryItem,
  ): Promise<{ id: string; unit_id?: string } | null> {
    if (!this.proxy) return null;

    const deviceType = item.kind === 'lock' ? 'blulok' : 'access_control';
    const search = item.kind === 'lock' ? item.lock_id : item.access_id;

    const res = await this.proxy.request('GET', '/devices', {
      query: { facility_id: this.facilityId, search, device_type: deviceType, limit: 5 },
    });
    if (res.status >= 400) return null;

    const body = res.body as { devices?: Array<{ id: string; unit_id?: string | null }> };
    const devices = body?.devices ?? [];
    const match = devices.find((d) => d.id) ?? devices[0];
    if (!match?.id) return null;

    return {
      id: match.id,
      unit_id: match.unit_id ?? undefined,
    };
  }

  applySettings(patch: {
    label?: string;
    gatewayName?: string;
    gatewaySerial?: string;
    gatewayFirmwareVersion?: string;
  }): void {
    if (patch.label !== undefined) {
      const trimmed = patch.label.trim();
      if (trimmed) this.label = trimmed;
    }
    if (patch.gatewayName !== undefined) {
      this.gatewayName = patch.gatewayName.trim();
    }
    if (patch.gatewaySerial !== undefined) {
      this.gatewaySerial = patch.gatewaySerial.trim();
    }
    if (patch.gatewayFirmwareVersion !== undefined) {
      const trimmed = patch.gatewayFirmwareVersion.trim();
      if (trimmed) this.gatewayFirmwareVersion = trimmed;
    }
    this.emitUpdate();
  }

  /** Serializable profile for persistence and undo snapshots (excludes connection runtime). */
  toProfile(): GatewayProfile {
    return {
      id: this.id,
      label: this.label,
      backendUrl: this.backendUrl,
      facilityId: this.facilityId,
      facilityName: this.facilityName,
      gatewayId: this.gatewayId,
      gatewayName: this.gatewayName,
      gatewaySerial: this.gatewaySerial,
      gatewayFirmwareVersion: this.gatewayFirmwareVersion,
      token: this.token,
      deviceRecords: this.registry.exportRecords(),
      behavior: normalizeBehavior(this.behavior),
      connectOnRestore: this.connectOnRestore,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Restore editable fields from a profile without changing connection state. */
  importProfile(profile: GatewayProfile): void {
    this.label = profile.label;
    this.gatewayName = profile.gatewayName;
    this.gatewaySerial = profile.gatewaySerial;
    const records = normalizeProfileDeviceRecords(profile, this.cachedOpsPublicKey);
    const legacyGateway = records.find((d) => d.item.kind === 'gateway');
    this.gatewayFirmwareVersion = resolveSimulatorGatewayFirmwareVersion({
      profileVersion: profile.gatewayFirmwareVersion,
      legacyInventoryVersion:
        legacyGateway?.item.kind === 'gateway' ? legacyGateway.item.firmware_version : undefined,
    });
    this.behavior = normalizeBehavior(profile.behavior);
    this.connectOnRestore = profile.connectOnRestore ?? false;
    this.registry.setCreateContext({ facilityId: this.facilityId, operationsKeyPublicB64: this.cachedOpsPublicKey });
    this.registry.load(records);
    if (this.behavior.periodicTelemetryMs > 0 && this.connectionStatus === 'connected') {
      this.startTelemetry();
    } else {
      this.stopTelemetry();
    }
    this.emitUpdate();
  }

  async persist(): Promise<void> {
    const profile: GatewayProfile = this.toProfile();
    await this.options.store.saveProfile(profile);
  }

  private startTelemetry(): void {
    this.stopTelemetry();
    if (this.behavior.periodicTelemetryMs <= 0 || !this.proxy) return;
    this.telemetryTimer = setInterval(() => {
      if (this.connectionStatus !== 'connected' || !this.proxy) return;
      void this.syncState().catch((err) =>
        this.log('system', `Telemetry sync failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }, this.behavior.periodicTelemetryMs);
  }

  private stopTelemetry(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
  }

  static deviceKeyForItem(item: DeviceInventoryItem): string {
    return deviceKey(item);
  }
}
