import { DeviceModel, UpdateAccessControlDeviceData, UpdateBluLokDeviceData } from '@/models/device.model';
import { ActivityLogModel } from '@/models/activity-log.model';
import { AccessCodeService } from '@/services/access-code.service';
import { ConflictError, NotFoundError } from '@/middleware/error.middleware';
import { isValidRelayChannel } from '@/utils/gateway-sync.utils';
import { logger } from '@/utils/logger';

export interface DeviceMetadataSideEffects {
  identityChanged: boolean;
  accessCodesPushed: boolean;
  previousIdentity?: {
    device_serial?: string;
    relay_channel?: number;
  };
}

export interface DeviceMetadataUpdateResult<TDevice> {
  device: TDevice;
  sideEffects: DeviceMetadataSideEffects;
}

export interface MetadataUpdateActor {
  userId: string;
  userName?: string;
}

export interface UpdateBluLokMetadataInput {
  device_serial?: string;
  serial?: string;
  firmware_version?: string;
  supports_remote_lock?: boolean;
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateAccessControlMetadataInput {
  name?: string;
  location_description?: string;
  device_serial?: string;
  relay_channel?: number;
  device_type?: 'gate' | 'elevator' | 'door';
  access_methods?: ('app' | 'keypad' | 'fob')[];
  supports_remote_lock?: boolean;
  supports_widget_timed_open?: boolean;
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | undefined,
  identityPatch?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(incoming && typeof incoming === 'object' ? incoming : {}),
    ...(identityPatch ?? {}),
  };
}

function mirrorSerialInSettings(
  existing: Record<string, unknown> | null | undefined,
  deviceSerial: string
): Record<string, unknown> {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    device_serial: deviceSerial,
    serial: deviceSerial,
  };
}

function applyIdentityOverrideMetadata(
  metadata: Record<string, unknown>,
  previous: { device_serial?: string; relay_channel?: number },
  actor: MetadataUpdateActor
): Record<string, unknown> {
  const next = { ...metadata };
  delete next.createdFromGatewaySync;
  next.adminIdentityOverride = true;
  next.previousIdentity = {
    ...previous,
    changedAt: new Date().toISOString(),
    changedBy: actor.userId,
  };
  return next;
}

export class DeviceMetadataService {
  private static instance: DeviceMetadataService;
  private deviceModel = new DeviceModel();
  private activityLogs = new ActivityLogModel();

  public static getInstance(): DeviceMetadataService {
    if (!DeviceMetadataService.instance) {
      DeviceMetadataService.instance = new DeviceMetadataService();
    }
    return DeviceMetadataService.instance;
  }

  async updateBluLokMetadata(
    deviceId: string,
    input: UpdateBluLokMetadataInput,
    actor: MetadataUpdateActor
  ): Promise<DeviceMetadataUpdateResult<Awaited<ReturnType<DeviceModel['findBluLokDeviceById']>>>> {
    const existing = await this.deviceModel.findBluLokDeviceById(deviceId);
    if (!existing) {
      throw new NotFoundError('Device not found');
    }

    const nextSerial =
      input.device_serial !== undefined
        ? String(input.device_serial).trim()
        : existing.device_serial;
    if (!nextSerial) {
      throw new ConflictError('device_serial is required');
    }

    const identityChanged =
      input.device_serial !== undefined &&
      String(input.device_serial).trim() !== String(existing.device_serial).trim();

    if (identityChanged) {
      const conflict = await this.deviceModel.findBluLokBySerial(nextSerial, deviceId);
      if (conflict) {
        throw new ConflictError(`Device serial "${nextSerial}" is already in use`);
      }
    }

    const nextSerialColumn =
      input.serial !== undefined ? String(input.serial).trim() : nextSerial;

    let metadata = mergeMetadata(existing.metadata, input.metadata);
    if (identityChanged) {
      metadata = applyIdentityOverrideMetadata(
        metadata,
        { device_serial: existing.device_serial },
        actor
      );
    }

    const updateData: UpdateBluLokDeviceData = {
      device_serial: input.device_serial !== undefined ? nextSerial : undefined,
      serial:
        input.device_serial !== undefined || input.serial !== undefined
          ? nextSerialColumn
          : undefined,
      firmware_version: input.firmware_version,
      supports_remote_lock: input.supports_remote_lock,
      device_settings: input.device_settings as Record<string, any> | undefined,
      metadata: input.metadata !== undefined || identityChanged ? metadata : undefined,
    };

    const hasChanges =
      identityChanged ||
      input.serial !== undefined ||
      input.firmware_version !== undefined ||
      input.supports_remote_lock !== undefined ||
      input.device_settings !== undefined ||
      input.metadata !== undefined;

    if (!hasChanges) {
      return {
        device: existing,
        sideEffects: { identityChanged: false, accessCodesPushed: false },
      };
    }

    const updated = await this.deviceModel.updateBluLokDevice(deviceId, updateData);
    if (!updated) {
      throw new NotFoundError('Device not found');
    }

    const facilityId = (existing as { gateway_facility_id?: string }).gateway_facility_id ?? null;

    await this.activityLogs.create({
      entity_type: 'device',
      entity_id: deviceId,
      activity_type: 'configuration_change',
      title: 'Device metadata updated',
      description: identityChanged
        ? `Hardware serial changed from ${existing.device_serial} to ${nextSerial}`
        : 'Device metadata fields updated',
      actor_type: 'user',
      actor_id: actor.userId,
      actor_name: actor.userName,
      facility_id: facilityId ?? undefined,
      unit_id: existing.unit_id ?? undefined,
      device_id: deviceId,
      metadata: {
        deviceCategory: 'blulok',
        identityChanged,
        previousIdentity: identityChanged ? { device_serial: existing.device_serial } : undefined,
        fields: Object.keys(input),
      },
    });

    const refreshed = await this.deviceModel.findBluLokDeviceById(deviceId);

    return {
      device: refreshed ?? { ...existing, ...updated },
      sideEffects: {
        identityChanged,
        accessCodesPushed: false,
        previousIdentity: identityChanged
          ? { device_serial: existing.device_serial }
          : undefined,
      },
    };
  }

  async updateAccessControlMetadata(
    deviceId: string,
    input: UpdateAccessControlMetadataInput,
    actor: MetadataUpdateActor
  ): Promise<
    DeviceMetadataUpdateResult<
      Awaited<ReturnType<DeviceModel['findAccessControlDeviceWithGateway']>>
    >
  > {
    const existing = await this.deviceModel.findAccessControlDeviceWithGateway(deviceId);
    if (!existing) {
      throw new NotFoundError('Device not found');
    }

    const nextSerial =
      input.device_serial !== undefined
        ? String(input.device_serial).trim()
        : existing.device_serial;
    const nextRelay =
      input.relay_channel !== undefined ? Number(input.relay_channel) : existing.relay_channel;

    if (!nextSerial) {
      throw new ConflictError('device_serial is required');
    }
    if (!isValidRelayChannel(nextRelay)) {
      throw new ConflictError('relay_channel must be an integer between 1 and 8');
    }

    const identityChanged =
      (input.device_serial !== undefined &&
        String(input.device_serial).trim() !== String(existing.device_serial).trim()) ||
      (input.relay_channel !== undefined && Number(input.relay_channel) !== existing.relay_channel);

    if (identityChanged) {
      const conflict = await this.deviceModel.findAccessControlIdentityConflict(
        existing.gateway_id,
        nextSerial,
        nextRelay,
        deviceId
      );
      if (conflict?.type === 'serial_relay') {
        throw new ConflictError(
          `Device serial "${nextSerial}" on relay ${nextRelay} is already in use`
        );
      }
    }

    let metadata = mergeMetadata(existing.metadata, input.metadata);
    let deviceSettings = mergeMetadata(existing.device_settings, input.device_settings);

    if (input.device_serial !== undefined || identityChanged) {
      deviceSettings = mirrorSerialInSettings(deviceSettings, nextSerial);
      metadata = {
        ...metadata,
        device_serial: nextSerial,
        serial: nextSerial,
      };
    }

    if (identityChanged) {
      metadata = applyIdentityOverrideMetadata(
        metadata,
        { device_serial: existing.device_serial, relay_channel: existing.relay_channel },
        actor
      );
    }

    const updateData: UpdateAccessControlDeviceData = {
      name: input.name,
      location_description: input.location_description,
      device_serial: input.device_serial !== undefined ? nextSerial : undefined,
      relay_channel: input.relay_channel !== undefined ? nextRelay : undefined,
      device_type: input.device_type,
      access_methods: input.access_methods,
      supports_remote_lock: input.supports_remote_lock,
      supports_widget_timed_open: input.supports_widget_timed_open,
      device_settings:
        input.device_settings !== undefined ||
        input.device_serial !== undefined ||
        identityChanged
          ? (deviceSettings as Record<string, any>)
          : undefined,
      metadata:
        input.metadata !== undefined ||
        input.device_serial !== undefined ||
        identityChanged
          ? metadata
          : undefined,
    };

    const hasChanges = Object.entries(updateData).some(([, v]) => v !== undefined);
    if (!hasChanges) {
      return {
        device: existing,
        sideEffects: { identityChanged: false, accessCodesPushed: false },
      };
    }

    const updated = await this.deviceModel.updateAccessControlDevice(deviceId, updateData);
    if (!updated) {
      throw new NotFoundError('Device not found');
    }

    let accessCodesPushed = false;
    if (identityChanged && existing.facility_id) {
      try {
        await AccessCodeService.getInstance().pushCodesToGateway(existing.facility_id);
        accessCodesPushed = true;
      } catch (err) {
        logger.warn('Failed to push access codes after access-control metadata update', { err });
      }
    }

    await this.activityLogs.create({
      entity_type: 'device',
      entity_id: deviceId,
      activity_type: 'configuration_change',
      title: 'Device metadata updated',
      description: identityChanged
        ? `Identity changed from ${existing.device_serial} relay ${existing.relay_channel} to ${nextSerial} relay ${nextRelay}`
        : 'Access control device metadata updated',
      actor_type: 'user',
      actor_id: actor.userId,
      actor_name: actor.userName,
      facility_id: existing.facility_id,
      device_id: deviceId,
      metadata: {
        deviceCategory: 'access_control',
        identityChanged,
        accessCodesPushed,
        previousIdentity: identityChanged
          ? {
              device_serial: existing.device_serial,
              relay_channel: existing.relay_channel,
            }
          : undefined,
        fields: Object.keys(input),
      },
    });

    const refreshed = await this.deviceModel.findAccessControlDeviceWithGateway(deviceId);

    return {
      device: refreshed ?? { ...existing, ...updated, facility_id: existing.facility_id },
      sideEffects: {
        identityChanged,
        accessCodesPushed,
        previousIdentity: identityChanged
          ? {
              device_serial: existing.device_serial,
              relay_channel: existing.relay_channel,
            }
          : undefined,
      },
    };
  }
}
