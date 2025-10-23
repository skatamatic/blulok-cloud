import { DatabaseService } from '@/services/database.service';
import { GatewayService } from '@/services/gateway/gateway.service';
import { UnitAssignmentEventsService } from './events/unit-assignment-events.service';
import { DeviceEventService, DeviceEvent, DeviceAddedEvent } from './device-event.service';
import { logger } from '@/utils/logger';

export class KeyDistributionService {
  private static instance: KeyDistributionService;
  private db;
  private gatewayService: GatewayService;
  private activeRotations = new Set<string>(); // Track device IDs currently being rotated

  private constructor() {
    this.db = DatabaseService.getInstance().connection;
    this.gatewayService = GatewayService.getInstance();
  }

  public static getInstance(): KeyDistributionService {
    if (!KeyDistributionService.instance) {
      KeyDistributionService.instance = new KeyDistributionService();
      KeyDistributionService.instance.setupEventListeners();
    }
    return KeyDistributionService.instance;
  }

  /**
   * Setup event listeners for tenancy and device changes
   */
  private setupEventListeners(): void {
    // Listen for unit assignment changes (tenancy changes)
    const unitAssignmentEvents = UnitAssignmentEventsService.getInstance();
    unitAssignmentEvents.onAssignmentChanged((event) => {
      this.onTenancyChange(event.tenantId).catch(err =>
        logger.error('Error handling tenancy change for key distribution:', err)
      );
    });

    // Listen for device added events (new locks online)
    const deviceEvents = DeviceEventService.getInstance();
    deviceEvents.on(DeviceEvent.DEVICE_ADDED, (event: DeviceAddedEvent) => {
      if (event.deviceType === 'blulok' && event.unitId) {
        this.onLockAdded(event.deviceId, event.unitId).catch(err =>
          logger.error('Error handling new lock for key distribution:', err)
        );
      }
    });
  }

  /**
   * Enqueue add-key for all locks the user can access, for a specific user device
   */
  public async addKeysForUserDevice(userId: string, userDeviceId: string): Promise<void> {
    const accessibleLocks = await this.getLocksForUser(userId);
    for (const lock of accessibleLocks) {
      await this.enqueueDistribution(userDeviceId, 'blulok', lock.id, 'pending_add');
    }
  }

  /**
   * Enqueue remove-key for all locks previously distributed to a user device
   */
  public async removeKeysForUserDevice(userDeviceId: string): Promise<void> {
    const rows = await this.db('device_key_distributions')
      .where({ user_device_id: userDeviceId })
      .select('target_type', 'target_id');

    for (const row of rows) {
      await this.enqueueDistribution(userDeviceId, row.target_type, row.target_id, 'pending_remove');
    }
  }

  /**
   * On tenancy change, enqueue add/remove diffs for all of the user's active devices
   * Uses smart diffing to only send necessary commands (adds/removes) instead of re-enqueueing everything
   */
  public async onTenancyChange(userId: string): Promise<void> {
    const devices = await this.db('user_devices')
      .where({ user_id: userId })
      .whereIn('status', ['pending_key', 'active']);

    if (devices.length === 0) {
      return; // No devices to manage
    }

    const accessibleLocks = await this.getLocksForUser(userId);
    const accessibleLockIds = accessibleLocks.map(lock => lock.id);

    // For each active device, compute the diff
    for (const device of devices) {
      await this.computeAndEnqueueDiffs(device.id, accessibleLockIds);
    }
  }

  /**
   * Rotate keys for a specific user device:
   * - Mark current distributions as pending_remove
   * - Compute diffs for current access and enqueue pending_add where needed
   *
   * Uses concurrency protection to prevent simultaneous rotations on the same device.
   */
  public async rotateKeysForUserDevice(userId: string, userDeviceId: string): Promise<void> {
    // Prevent concurrent rotations for the same device
    if (this.activeRotations.has(userDeviceId)) {
      throw new Error(`Rotation already in progress for device ${userDeviceId}`);
    }

    this.activeRotations.add(userDeviceId);

    try {
      // Mark existing added/pending_add as pending_remove
      await this.db('device_key_distributions')
        .where({ user_device_id: userDeviceId, target_type: 'blulok' })
        .whereIn('status', ['added', 'pending_add'])
        .update({ status: 'pending_remove', updated_at: this.db.fn.now() });

      // Enqueue adds based on current access using smart diff
      const accessibleLocks = await this.getLocksForUser(userId);
      const accessibleLockIds = accessibleLocks.map(l => l.id);
      await this.computeAndEnqueueDiffs(userDeviceId, accessibleLockIds);
    } finally {
      // Always remove from active rotations
      this.activeRotations.delete(userDeviceId);
    }
  }

  /**
   * Compute and enqueue only the necessary add/remove operations for a device
   */
  private async computeAndEnqueueDiffs(userDeviceId: string, shouldHaveAccessTo: string[]): Promise<void> {
    // Get currently distributed keys for this device
    const currentDistributions = await this.db('device_key_distributions')
      .where({ user_device_id: userDeviceId, target_type: 'blulok' })
      .whereIn('status', ['added', 'pending_add', 'pending_remove'])
      .select('target_id', 'status');

    const currentlyDistributed = new Map<string, string>();
    for (const dist of currentDistributions) {
      currentlyDistributed.set(dist.target_id, dist.status);
    }

    // Compute what needs to be added
    for (const lockId of shouldHaveAccessTo) {
      const currentStatus = currentlyDistributed.get(lockId);

      if (!currentStatus) {
        // New access - enqueue add
        await this.enqueueDistribution(userDeviceId, 'blulok', lockId, 'pending_add');
      } else if (currentStatus === 'pending_remove') {
        // Was being removed but now should have access - cancel removal by updating status
        await this.db('device_key_distributions')
          .where({ user_device_id: userDeviceId, target_type: 'blulok', target_id: lockId })
          .update({ status: 'added', updated_at: this.db.fn.now() });
      }
      // If already 'added' or 'pending_add', leave as-is
    }

    // Compute what needs to be removed
    for (const [lockId, status] of currentlyDistributed.entries()) {
      if (!shouldHaveAccessTo.includes(lockId)) {
        if (status === 'added' || status === 'pending_add') {
          // Lost access - enqueue remove
          await this.enqueueDistribution(userDeviceId, 'blulok', lockId, 'pending_remove');
        }
        // If already 'pending_remove', leave as-is
      }
    }
  }

  /**
   * On lock added/online, enqueue add for all users with access across their active devices
   */
  public async onLockAdded(lockId: string, unitId: string): Promise<void> {
    const tenantIds = await this.getTenantsWithAccessToUnit(unitId);
    for (const tenantId of tenantIds) {
      const devices = await this.db('user_devices')
        .where({ user_id: tenantId })
        .whereIn('status', ['pending_key', 'active']);
      for (const device of devices) {
        await this.enqueueDistribution(device.id, 'blulok', lockId, 'pending_add');
      }
    }
  }

  /**
   * Worker to process pending distributions (can be tied to a queue later)
   */
  public async processPending(): Promise<void> {
    // Add retry_count to the selection to implement retry logic
    const pending = await this.db('device_key_distributions')
      .whereIn('status', ['pending_add', 'pending_remove'])
      .select('*') // Need retry_count field
      .limit(100);

    for (const job of pending) {
      try {
        const userDevice = await this.db('user_devices').where({ id: job.user_device_id }).first();
        if (!userDevice || !userDevice.public_key) {
          await this.markFailed(job.id, 'Missing user device or public key');
          continue;
        }

        // Check retry count (assume max 3 retries)
        const retryCount = job.retry_count || 0;
        const maxRetries = 3;

        if (retryCount >= maxRetries) {
          await this.markFailed(job.id, `Max retries (${maxRetries}) exceeded`);
          logger.warn(`Key distribution job ${job.id} exceeded max retries`, { jobId: job.id });
          continue;
        }

        if (job.status === 'pending_add') {
          // Send via gateway service (by lock id), validate gateway hasn't changed
          await this.gatewayService.addKeyToLock(job.target_id, userDevice.public_key, userDevice.user_id, job.gateway_id);
          await this.markStatus(job.id, 'added');
        } else {
          await this.gatewayService.removeKeyFromLock(job.target_id, userDevice.public_key, userDevice.user_id, job.gateway_id);
          await this.markStatus(job.id, 'removed');
        }
      } catch (error: any) {
        // Increment retry count and schedule for retry with exponential backoff
        const retryCount = (job.retry_count || 0) + 1;
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s

        await this.db('device_key_distributions')
          .where({ id: job.id })
          .update({
            retry_count: retryCount,
            last_attempt_at: this.db.fn.now(),
            error: error?.message || 'Unknown error',
            updated_at: this.db.fn.now(),
          });

        logger.warn(`Key distribution job ${job.id} failed (attempt ${retryCount}), retrying in ${backoffMs}ms`, {
          jobId: job.id,
          error: error?.message,
          backoffMs
        });
      }
    }
  }

  private async enqueueDistribution(userDeviceId: string, targetType: 'blulok' | 'access_control', targetId: string, status: 'pending_add' | 'pending_remove'): Promise<void> {
    let gatewayId: string | null = null;
    let keyVersion: 'v1' | 'v2' = 'v2';
    if (targetType === 'blulok') {
      const device = await this.db('blulok_devices').where({ id: targetId }).select('gateway_id').first();
      gatewayId = device?.gateway_id || null;
      if (gatewayId) {
        const gw = await this.db('gateways').where({ id: gatewayId }).select('key_management_version').first();
        keyVersion = (gw?.key_management_version as 'v1' | 'v2') || 'v2';
      }
    }

    // Enqueue durable command
    if (gatewayId) {
      const { CommandQueueService } = await import('@/services/command-queue.service');
      const queue = CommandQueueService.getInstance();
      const command_type = status === 'pending_add' ? 'ADD_KEY' : 'REVOKE_KEY';

      // Resolve facility id for lock
      const lockRow = await this.db('blulok_devices').where({ id: targetId }).select('gateway_id', 'facility_id').first();
      const facilityId = lockRow?.facility_id as string;

      const userDevice = await this.db('user_devices').where({ id: userDeviceId }).first();

      // Build payload by key version
      const basePayload = { user_device_id: userDeviceId } as any;
      const payload = keyVersion === 'v2'
        ? (status === 'pending_add'
            ? { ...basePayload, public_key: userDevice?.public_key, user_id: userDevice?.user_id }
            : { ...basePayload, public_key: userDevice?.public_key })
        : (status === 'pending_add'
            ? { ...basePayload, revision: 0, key_code: 0, key_counter: 0, key_secret: '', key_token: userDevice?.user_id }
            : { ...basePayload, key_code: 0 }); // v1 requires real fields; will be filled by a higher layer if used

      await queue.enqueue({
        facility_id: facilityId,
        gateway_id: gatewayId,
        device_id: targetId,
        command_type,
        payload,
      });
    }

    // Record distribution row
    await this.db('device_key_distributions').insert({
      user_device_id: userDeviceId,
      target_type: targetType,
      target_id: targetId,
      gateway_id: gatewayId,
      key_version: keyVersion,
      status,
      created_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
  }

  private async markStatus(id: string, status: 'added' | 'removed'): Promise<void> {
    await this.db('device_key_distributions')
      .where({ id })
      .update({ status, last_attempt_at: this.db.fn.now(), updated_at: this.db.fn.now() });

    // Auto-advance device status if all distributions are added
    if (status === 'added') {
      const row = await this.db('device_key_distributions').where({ id }).first();
      if (row?.user_device_id) {
        await this.checkAndActivateUserDevice(row.user_device_id);
      }
    }
  }

  private async markFailed(id: string, error: string): Promise<void> {
    await this.db('device_key_distributions')
      .where({ id })
      .update({ status: 'failed', error, last_attempt_at: this.db.fn.now(), updated_at: this.db.fn.now() });
  }

  public async checkAndActivateUserDevice(userDeviceId: string): Promise<void> {
    // If there are no pending_add for this device, and at least one added exists, mark device active
    const pending = await this.db('device_key_distributions')
      .where({ user_device_id: userDeviceId })
      .where('status', 'pending_add')
      .count<{ count: number }>({ count: '*' })
      .first();
    const added = await this.db('device_key_distributions')
      .where({ user_device_id: userDeviceId })
      .where('status', 'added')
      .count<{ count: number }>({ count: '*' })
      .first();
    const hasPending = Number((pending as any)?.count || 0) > 0;
    const hasAnyAdded = Number((added as any)?.count || 0) > 0;
    if (!hasPending && hasAnyAdded) {
      await this.db('user_devices')
        .where({ id: userDeviceId })
        .update({ status: 'active', updated_at: this.db.fn.now() });
    }
  }

  // Resolve locks accessible by a user through unit assignments
  private async getLocksForUser(userId: string): Promise<Array<{ id: string }>> {
    const locks = await this.db('blulok_devices as bd')
      .join('unit_assignments as ua', 'bd.unit_id', 'ua.unit_id')
      .where('ua.tenant_id', userId)
      .select('bd.id')
      .distinct();
    return locks;
  }

  // Resolve tenants with access to a unit
  private async getTenantsWithAccessToUnit(unitId: string): Promise<string[]> {
    const tenants = await this.db('unit_assignments')
      .where('unit_id', unitId)
      .select('tenant_id')
      .distinct();
    return tenants.map(row => row.tenant_id);
  }
}


