import { useEffect, useMemo, useState } from 'react';
import { PencilIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal } from '@/components/Modal/Modal';
import { ConfirmModal } from '@/components/Modal/ConfirmModal';
import { apiService } from '@/services/api.service';
import { AccessMethod } from '@/types/facility.types';
import { isGatewaySyncProvisioned } from '@/utils/accessDeviceDisplay.utils';
import { DeviceMetadataSideEffects } from '@/types/facility.types';
import { mapDeviceApiErrorToFields } from '@/utils/deviceApiErrors';
import {
  ACCESS_CONTROLLER_TYPES,
  buildBluLokDeviceSettings,
  readDisplayName,
  readLocationDescription,
  readLockNumber,
} from '@/utils/deviceMetadataForm.utils';

export type DeviceMetadataCategory = 'blulok' | 'access_control';

export interface EditDeviceMetadataSource {
  id: string;
  category: DeviceMetadataCategory;
  device_serial: string;
  serial?: string;
  relay_channel?: number;
  name?: string;
  location_description?: string;
  device_type?: 'gate' | 'elevator' | 'door';
  access_methods?: AccessMethod[];
  supports_remote_lock?: boolean;
  firmware_version?: string;
  device_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  unit_number?: string;
  lock_status?: string;
  device_status?: string;
  battery_level?: number;
  signal_strength?: number;
  temperature?: number;
  last_seen?: string;
}

interface EditDeviceMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (sideEffects?: DeviceMetadataSideEffects) => void;
  device: EditDeviceMetadataSource | null;
}

interface BluLokForm {
  device_serial: string;
  serial: string;
  lock_number: string;
  display_name: string;
  location_description: string;
  supports_remote_lock: boolean;
  firmware_version: string;
}

interface AccessControlForm {
  name: string;
  location_description: string;
  device_serial: string;
  relay_channel: number;
  device_type: 'gate' | 'elevator' | 'door';
  access_methods: AccessMethod[];
  supports_remote_lock: boolean;
}

const RELAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function toggleMethod(methods: AccessMethod[], method: AccessMethod): AccessMethod[] {
  const next = methods.includes(method) ? methods.filter((m) => m !== method) : [...methods, method];
  return next.length > 0 ? next : ['app'];
}

export function EditDeviceMetadataModal({
  isOpen,
  onClose,
  onSuccess,
  device,
}: EditDeviceMetadataModalProps) {
  const [bluForm, setBluForm] = useState<BluLokForm>({
    device_serial: '',
    serial: '',
    lock_number: '',
    display_name: '',
    location_description: '',
    supports_remote_lock: false,
    firmware_version: '',
  });
  const [acForm, setAcForm] = useState<AccessControlForm>({
    name: '',
    location_description: '',
    device_serial: '',
    relay_channel: 1,
    device_type: 'door',
    access_methods: ['app'],
    supports_remote_lock: false,
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showIdentityConfirm, setShowIdentityConfirm] = useState(false);
  const [advancedMetadataJson, setAdvancedMetadataJson] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!isOpen || !device) return;
    if (device.category === 'blulok') {
      setBluForm({
        device_serial: device.device_serial ?? '',
        serial: device.serial ?? '',
        lock_number: readLockNumber(device.device_settings),
        display_name: readDisplayName(device.device_settings) || device.name || '',
        location_description:
          device.location_description ?? readLocationDescription(device.device_settings),
        supports_remote_lock: device.supports_remote_lock === true,
        firmware_version: device.firmware_version ?? '',
      });
    } else {
      setAcForm({
        name: device.name ?? '',
        location_description: device.location_description ?? '',
        device_serial: device.device_serial ?? '',
        relay_channel: device.relay_channel ?? 1,
        device_type: device.device_type ?? 'door',
        access_methods:
          device.access_methods && device.access_methods.length > 0
            ? device.access_methods
            : ['app'],
        supports_remote_lock: device.supports_remote_lock === true,
      });
    }
    setAdvancedMetadataJson(
      device.metadata ? JSON.stringify(device.metadata, null, 2) : '{}'
    );
    setErrors({});
    setShowAdvanced(false);
    setShowIdentityConfirm(false);
  }, [isOpen, device]);

  const identityWillChange = useMemo(() => {
    if (!device) return false;
    if (device.category === 'blulok') {
      return bluForm.device_serial.trim() !== device.device_serial.trim();
    }
    return (
      acForm.device_serial.trim() !== device.device_serial.trim() ||
      acForm.relay_channel !== (device.relay_channel ?? 1)
    );
  }, [device, bluForm.device_serial, acForm.device_serial, acForm.relay_channel]);

  const isDirty = useMemo(() => {
    if (!device) return false;
    if (device.category === 'blulok') {
      const baseSettings = device.device_settings ?? {};
      const nextSettings = buildBluLokDeviceSettings(baseSettings, {
        lockNumber: bluForm.lock_number,
        displayName: bluForm.display_name,
        locationDescription: bluForm.location_description,
      });
      return (
        bluForm.device_serial.trim() !== device.device_serial.trim() ||
        bluForm.serial.trim() !== (device.serial ?? '').trim() ||
        bluForm.lock_number.trim() !== readLockNumber(device.device_settings) ||
        bluForm.display_name.trim() !== readDisplayName(device.device_settings) ||
        bluForm.location_description.trim() !==
          (device.location_description ?? readLocationDescription(device.device_settings)).trim() ||
        bluForm.supports_remote_lock !== (device.supports_remote_lock === true) ||
        bluForm.firmware_version.trim() !== (device.firmware_version ?? '').trim() ||
        JSON.stringify(nextSettings) !== JSON.stringify(baseSettings) ||
        advancedMetadataJson !== JSON.stringify(device.metadata ?? {}, null, 2)
      );
    }
    const baseMethods = device.access_methods?.length ? device.access_methods : ['app'];
    const methodsChanged =
      JSON.stringify([...acForm.access_methods].sort()) !==
      JSON.stringify([...baseMethods].sort());
    return (
      acForm.name.trim() !== (device.name ?? '').trim() ||
      acForm.location_description.trim() !== (device.location_description ?? '').trim() ||
      acForm.device_serial.trim() !== device.device_serial.trim() ||
      acForm.relay_channel !== (device.relay_channel ?? 1) ||
      acForm.device_type !== (device.device_type ?? 'door') ||
      acForm.supports_remote_lock !== (device.supports_remote_lock === true) ||
      methodsChanged ||
      advancedMetadataJson !== JSON.stringify(device.metadata ?? {}, null, 2)
    );
  }, [device, bluForm, acForm, advancedMetadataJson]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (device?.category === 'blulok') {
      if (!bluForm.device_serial.trim()) next.device_serial = 'Serial is required';
      if (bluForm.lock_number.trim()) {
        const n = Number(bluForm.lock_number);
        if (!Number.isFinite(n)) next.lock_number = 'Lock number must be numeric';
      }
    } else {
      if (!acForm.name.trim()) next.name = 'Name is required';
      if (!acForm.device_serial.trim()) next.device_serial = 'Hardware serial is required';
      if (!RELAY_OPTIONS.includes(acForm.relay_channel as (typeof RELAY_OPTIONS)[number])) {
        next.relay_channel = 'Relay must be between 1 and 8';
      }
    }
    if (showAdvanced) {
      try {
        JSON.parse(advancedMetadataJson);
      } catch {
        next.metadata = 'Metadata must be valid JSON';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!device || !validate()) return;
    setLoading(true);
    setErrors({});
    try {
      let parsedMetadata: Record<string, unknown> | undefined;
      if (showAdvanced) {
        parsedMetadata = JSON.parse(advancedMetadataJson) as Record<string, unknown>;
      }

      let sideEffects: DeviceMetadataSideEffects | undefined;

      if (device.category === 'blulok') {
        const deviceSettings = buildBluLokDeviceSettings(device.device_settings, {
          lockNumber: bluForm.lock_number,
          displayName: bluForm.display_name,
          locationDescription: bluForm.location_description,
        });
        const res = await apiService.updateBluLokDeviceMetadata(device.id, {
          device_serial: bluForm.device_serial.trim(),
          serial: bluForm.serial.trim() || undefined,
          supports_remote_lock: bluForm.supports_remote_lock,
          firmware_version: bluForm.firmware_version.trim() || undefined,
          device_settings: deviceSettings,
          metadata: parsedMetadata,
        });
        sideEffects = res.sideEffects;
      } else {
        const res = await apiService.updateAccessControlDeviceMetadata(device.id, {
          name: acForm.name.trim(),
          location_description: acForm.location_description.trim(),
          device_serial: acForm.device_serial.trim(),
          relay_channel: acForm.relay_channel,
          device_type: acForm.device_type,
          access_methods: acForm.access_methods,
          supports_remote_lock: acForm.supports_remote_lock,
          metadata: parsedMetadata,
        });
        sideEffects = res.sideEffects;
      }
      onSuccess(sideEffects);
      onClose();
    } catch (err: unknown) {
      const message =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'message' in err.response.data &&
        typeof err.response.data.message === 'string'
          ? err.response.data.message
          : 'Failed to update device metadata';
      const status =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'status' in err.response
          ? Number(err.response.status)
          : undefined;
      setErrors(status === 409 ? mapDeviceApiErrorToFields(message) : { submit: message });
    } finally {
      setLoading(false);
      setShowIdentityConfirm(false);
    }
  };

  const handleSaveClick = () => {
    if (!validate()) return;
    if (identityWillChange) {
      setShowIdentityConfirm(true);
      return;
    }
    void submit();
  };

  if (!device) return null;

  const gatewaySyncManaged = isGatewaySyncProvisioned(device.metadata);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="xl" title="Edit device">
        <div className="border-b border-gray-200 px-8 py-6 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="rounded-xl bg-primary-100 p-3 dark:bg-primary-900/20">
              <PencilIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Edit device</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Update hardware identity and configuration
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-8 py-6">
          {gatewaySyncManaged && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-900/20">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-900 dark:text-amber-200">
                This device was provisioned from gateway inventory. Saving identity changes marks it
                as admin-corrected so sync will not remove it if the gateway still reports the old
                serial. Lock number and other settings may be overwritten when the gateway sends a
                matching inventory update.
              </p>
            </div>
          )}

          {device.category === 'blulok' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Hardware serial (lock_id) *
                </label>
                <input
                  type="text"
                  value={bluForm.device_serial}
                  onChange={(e) => setBluForm((p) => ({ ...p, device_serial: e.target.value }))}
                  className={`block w-full rounded-lg border px-3 py-2 font-mono text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                    errors.device_serial
                      ? 'border-red-300 dark:border-red-600'
                      : 'border-gray-300 dark:border-gray-600'
                  } bg-white text-gray-900 dark:bg-gray-700 dark:text-white`}
                />
                {errors.device_serial && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.device_serial}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="edit-blulok-lock-number"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Lock number
                </label>
                <input
                  id="edit-blulok-lock-number"
                  type="number"
                  value={bluForm.lock_number}
                  onChange={(e) => setBluForm((p) => ({ ...p, lock_number: e.target.value }))}
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                    errors.lock_number ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-gray-700 dark:text-white`}
                  placeholder="e.g. 2453"
                />
                {errors.lock_number && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lock_number}</p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Gateway inventory field <code className="font-mono">lock_number</code>
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Secondary serial
                </label>
                <input
                  type="text"
                  value={bluForm.serial}
                  onChange={(e) => setBluForm((p) => ({ ...p, serial: e.target.value }))}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Optional hardware serial"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Display name
                </label>
                <input
                  type="text"
                  value={bluForm.display_name}
                  onChange={(e) => setBluForm((p) => ({ ...p, display_name: e.target.value }))}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Firmware version
                </label>
                <input
                  type="text"
                  value={bluForm.firmware_version}
                  onChange={(e) =>
                    setBluForm((p) => ({ ...p, firmware_version: e.target.value }))
                  }
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label
                  htmlFor="edit-blulok-location"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Location note
                </label>
                <input
                  id="edit-blulok-location"
                  type="text"
                  value={bluForm.location_description}
                  onChange={(e) =>
                    setBluForm((p) => ({ ...p, location_description: e.target.value }))
                  }
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="md:col-span-2 flex items-center">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={bluForm.supports_remote_lock}
                    onChange={(e) =>
                      setBluForm((p) => ({ ...p, supports_remote_lock: e.target.checked }))
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Supports remote lock (CLOSE) from cloud
                </label>
              </div>
              {device.unit_number && (
                <p className="md:col-span-2 text-xs text-gray-500 dark:text-gray-400">
                  Assigned to unit {device.unit_number}. Change unit assignment from the unit or
                  devices page.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Name *
                </label>
                <input
                  type="text"
                  value={acForm.name}
                  onChange={(e) => setAcForm((p) => ({ ...p, name: e.target.value }))}
                  className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                    errors.name ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                  } bg-white text-gray-900 dark:bg-gray-700 dark:text-white`}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Controller type *
                </label>
                <select
                  value={acForm.device_type}
                  onChange={(e) =>
                    setAcForm((p) => ({
                      ...p,
                      device_type: e.target.value as AccessControlForm['device_type'],
                    }))
                  }
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {ACCESS_CONTROLLER_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Relay channel *
                </label>
                <select
                  value={acForm.relay_channel}
                  onChange={(e) =>
                    setAcForm((p) => ({ ...p, relay_channel: Number(e.target.value) }))
                  }
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {RELAY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      Relay {n}
                    </option>
                  ))}
                </select>
                {errors.relay_channel && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.relay_channel}</p>
                )}
              </div>
              <div className="md:col-span-2">
                <label
                  htmlFor="edit-ac-location"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Location
                </label>
                <input
                  id="edit-ac-location"
                  type="text"
                  value={acForm.location_description}
                  onChange={(e) =>
                    setAcForm((p) => ({ ...p, location_description: e.target.value }))
                  }
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Hardware serial (access_id) *
                </label>
                <input
                  type="text"
                  value={acForm.device_serial}
                  onChange={(e) => setAcForm((p) => ({ ...p, device_serial: e.target.value }))}
                  className={`block w-full rounded-lg border px-3 py-2 font-mono text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                    errors.device_serial
                      ? 'border-red-300 dark:border-red-600'
                      : 'border-gray-300 dark:border-gray-600'
                  } bg-white text-gray-900 dark:bg-gray-700 dark:text-white`}
                />
                {errors.device_serial && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.device_serial}</p>
                )}
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Access methods</p>
                <div className="flex flex-wrap gap-3">
                  {(['app', 'keypad', 'fob'] as const).map((method) => (
                    <label
                      key={method}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300"
                    >
                      <input
                        type="checkbox"
                        checked={acForm.access_methods.includes(method)}
                        onChange={() =>
                          setAcForm((p) => ({
                            ...p,
                            access_methods: toggleMethod(p.access_methods, method),
                          }))
                        }
                      />
                      <span className="capitalize">{method}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={acForm.supports_remote_lock}
                    onChange={(e) =>
                      setAcForm((p) => ({ ...p, supports_remote_lock: e.target.checked }))
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Supports remote lock (CLOSE) from cloud
                </label>
              </div>
            </div>
          )}

          {(device.lock_status ||
            device.device_status ||
            device.battery_level != null ||
            device.signal_strength != null ||
            device.temperature != null ||
            device.last_seen) && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Live telemetry (gateway state sync)
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Updated by gateway inventory/state messages — edit identity fields above, not here.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {device.lock_status && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">Lock status</dt>
                    <dd className="text-gray-900 dark:text-white capitalize">{device.lock_status}</dd>
                  </>
                )}
                {device.device_status && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">Device status</dt>
                    <dd className="text-gray-900 dark:text-white capitalize">{device.device_status}</dd>
                  </>
                )}
                {device.battery_level != null && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">Battery</dt>
                    <dd className="text-gray-900 dark:text-white">{device.battery_level}</dd>
                  </>
                )}
                {device.signal_strength != null && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">Signal</dt>
                    <dd className="text-gray-900 dark:text-white">{device.signal_strength} dBm</dd>
                  </>
                )}
                {device.temperature != null && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">Temperature</dt>
                    <dd className="text-gray-900 dark:text-white">{device.temperature}°C</dd>
                  </>
                )}
                {device.last_seen && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400">Last seen</dt>
                    <dd className="text-gray-900 dark:text-white">{device.last_seen}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              {showAdvanced ? 'Hide advanced metadata' : 'Advanced metadata (JSON)'}
            </button>
            {showAdvanced && (
              <textarea
                value={advancedMetadataJson}
                onChange={(e) => setAdvancedMetadataJson(e.target.value)}
                rows={8}
                className={`mt-2 block w-full rounded-lg border px-3 py-2 font-mono text-xs shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                  errors.metadata ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                } bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100`}
              />
            )}
            {errors.metadata && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.metadata}</p>
            )}
          </div>

          {errors.submit && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-8 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={loading || !isDirty}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showIdentityConfirm}
        onClose={() => setShowIdentityConfirm(false)}
        onConfirm={() => void submit()}
        title="Confirm identity change"
        message={
          device.category === 'blulok'
            ? `Change hardware serial from "${device.device_serial}" to "${bluForm.device_serial.trim()}"? This affects gateway commands and route passes; users may need to refresh mobile passes.`
            : `Change identity from serial "${device.device_serial}" relay ${device.relay_channel ?? 1} to serial "${acForm.device_serial.trim()}" relay ${acForm.relay_channel}? Access codes will be re-pushed to the gateway if the relay changed.`
        }
        confirmText="Save identity change"
        variant="info"
        isLoading={loading}
      />
    </>
  );
}
