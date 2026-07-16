import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BoltIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  HomeIcon,
  LockClosedIcon,
  PlusCircleIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import { ACCESS_DEVICE_TYPE_OPTIONS } from '@/utils/device-icon.utils';
import { AnimatePresence, motion } from 'framer-motion';
import axios from 'axios';
import { Modal } from '@/components/Modal/Modal';
import { apiService } from '@/services/api.service';
import { Facility, Gateway, Unit, CreateAccessControlDevicePayload } from '@/types/facility.types';
import { mapDeviceApiErrorToFields } from '@/utils/deviceApiErrors';
import { buildBluLokDeviceSettings } from '@/utils/deviceMetadataForm.utils';
import { NO_FEEDBACK_OPEN_TIMEOUT_MAX_SEC } from '@/constants/access-control-feedback.constants';

type HardwareKind = 'access_control' | 'blulok';
type WizardStep = 'type' | 'location' | 'configure' | 'review';

interface CreateAccessControlDeviceData extends CreateAccessControlDevicePayload {
  access_methods: Array<'app' | 'keypad' | 'fob'>;
  supports_remote_lock: boolean;
  supports_widget_timed_open: boolean;
  has_lock_feedback: boolean;
  no_feedback_open_timeout_sec: number;
}

interface CreateBluLokDeviceData {
  gateway_id: string;
  unit_id: string;
  device_serial: string;
  serial: string;
  lock_number: string;
  display_name: string;
  location_description: string;
  firmware_version: string;
  supports_remote_lock: boolean;
}

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  facilityId?: string;
  /** @deprecated Prefer letting the user pick hardware type in the wizard. */
  deviceType?: HardwareKind;
}

const ACCESS_DEVICE_TYPES = ACCESS_DEVICE_TYPE_OPTIONS.map(({ Icon, ...rest }) => ({
  ...rest,
  icon: Icon,
}));

const HARDWARE_OPTIONS: Array<{
  id: HardwareKind;
  title: string;
  description: string;
  icon: typeof LockClosedIcon;
  accent: string;
}> = [
  {
    id: 'blulok',
    title: 'BluLok lock',
    description: 'Smart lock identified by hardware serial — assign to a unit now or later.',
    icon: LockClosedIcon,
    accent: 'from-blue-500/10 to-blue-600/5 border-blue-200 dark:border-blue-800',
  },
  {
    id: 'access_control',
    title: 'Access control',
    description: 'Gate, door, or elevator controller on a gateway relay channel.',
    icon: BoltIcon,
    accent: 'from-primary-500/10 to-primary-600/5 border-primary-200 dark:border-primary-800',
  },
];

function resolveSteps(facilityId?: string): WizardStep[] {
  return facilityId ? ['type', 'configure', 'review'] : ['type', 'location', 'configure', 'review'];
}

function StepIndicator({ steps, current }: { steps: WizardStep[]; current: WizardStep }) {
  const labels: Record<WizardStep, string> = {
    type: 'Hardware',
    location: 'Facility',
    configure: 'Details',
    review: 'Review',
  };
  const currentIndex = steps.indexOf(current);

  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <motion.div key={step} className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done
                  ? 'bg-primary-600 text-white'
                  : active
                    ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500 dark:bg-primary-900/40 dark:text-primary-300'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              }`}
            >
              {done ? <CheckCircleIcon className="h-4 w-4" /> : index + 1}
            </div>
            <span
              className={`hidden sm:block text-xs font-medium truncate ${
                active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {labels[step]}
            </span>
            {index < steps.length - 1 && (
              <motion.div
                className={`h-px flex-1 mx-1 ${done ? 'bg-primary-400' : 'bg-gray-200 dark:bg-gray-700'}`}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export function AddDeviceModal({ isOpen, onClose, onSuccess, facilityId, deviceType }: AddDeviceModalProps) {
  const steps = useMemo(() => resolveSteps(facilityId), [facilityId]);
  const [step, setStep] = useState<WizardStep>('type');
  const [selectedDeviceType, setSelectedDeviceType] = useState<HardwareKind | null>(deviceType ?? null);

  const [accessControlData, setAccessControlData] = useState<CreateAccessControlDeviceData>({
    gateway_id: '',
    device_serial: '',
    name: '',
    device_type: 'gate',
    location_description: '',
    relay_channel: 1,
    access_methods: ['app'],
    supports_remote_lock: false,
    supports_widget_timed_open: false,
    has_lock_feedback: true,
    no_feedback_open_timeout_sec: 0,
    device_settings: {},
  });

  const [bluLokData, setBluLokData] = useState<CreateBluLokDeviceData>({
    gateway_id: '',
    unit_id: '',
    device_serial: '',
    serial: '',
    lock_number: '',
    display_name: '',
    location_description: '',
    firmware_version: '',
    supports_remote_lock: false,
  });

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<string>(facilityId || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetWizard = useCallback(() => {
    const initialStep: WizardStep =
      facilityId && deviceType ? 'configure' : deviceType && !facilityId ? 'location' : steps[0];
    setStep(initialStep);
    setSelectedDeviceType(deviceType ?? null);
    setAccessControlData({
      gateway_id: '',
      device_serial: '',
      name: '',
      device_type: 'gate',
      location_description: '',
      relay_channel: 1,
      access_methods: ['app'],
      supports_remote_lock: false,
      supports_widget_timed_open: false,
      has_lock_feedback: true,
      no_feedback_open_timeout_sec: 0,
      device_settings: {},
    });
    setBluLokData({
      gateway_id: '',
      unit_id: '',
      device_serial: '',
      serial: '',
      lock_number: '',
      display_name: '',
      location_description: '',
      firmware_version: '',
      supports_remote_lock: false,
    });
    setSelectedFacility(facilityId || '');
    setGateways([]);
    setErrors({});
  }, [deviceType, facilityId, steps]);

  const applyGatewaySelection = (gatewayId: string) => {
    setAccessControlData((prev) => ({ ...prev, gateway_id: gatewayId }));
    setBluLokData((prev) => ({ ...prev, gateway_id: gatewayId }));
  };

  useEffect(() => {
    if (isOpen) {
      resetWizard();
      void loadFacilities();
      if (facilityId) {
        setSelectedFacility(facilityId);
        void loadGatewaysForFacility(facilityId);
        void loadUnits(facilityId);
      }
    }
  }, [isOpen, facilityId, resetWizard]);

  const loadFacilities = async () => {
    try {
      const response = await apiService.getFacilities();
      setFacilities(response.facilities || []);
    } catch (error) {
      console.error('Failed to load facilities:', error);
    }
  };

  const loadUnits = async (fid: string) => {
    try {
      const response = await apiService.getUnits({ facility_id: fid });
      setUnits(response.units || []);
    } catch (error) {
      console.error('Failed to load units:', error);
    }
  };

  const loadGatewaysForFacility = async (facilityIdValue: string) => {
    try {
      const response = await apiService.getGateways({
        facility_id: facilityIdValue,
        limit: 50,
        offset: 0,
      });
      const list = (response?.gateways ?? []) as Gateway[];
      setGateways(list);

      if (list.length === 0) {
        applyGatewaySelection('');
        setErrors((prev) => ({
          ...prev,
          gateway_id: 'No gateway assigned to this facility yet',
        }));
        return;
      }

      const currentId = bluLokData.gateway_id || accessControlData.gateway_id;
      const nextId =
        currentId && list.some((g) => g.id === currentId) ? currentId : list[0].id;
      applyGatewaySelection(nextId);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.gateway_id;
        return next;
      });
    } catch (error) {
      console.error('Failed to load gateways for facility:', error);
      setErrors((prev) => ({
        ...prev,
        gateway_id: 'Failed to load gateways for selected facility',
      }));
    }
  };

  const validateStep = (target: WizardStep): boolean => {
    const newErrors: Record<string, string> = {};

    if (target === 'type' && !selectedDeviceType) {
      newErrors.type = 'Choose BluLok or access control to continue';
    }

    if (target === 'location') {
      if (!selectedFacility) {
        newErrors.facility = 'Select a facility';
      } else if (!accessControlData.gateway_id && !bluLokData.gateway_id) {
        newErrors.gateway_id = errors.gateway_id || 'This facility needs a gateway before adding devices';
      }
    }

    if (target === 'configure' || target === 'review') {
      const activeGatewayId =
        selectedDeviceType === 'access_control'
          ? accessControlData.gateway_id
          : bluLokData.gateway_id;
      if (!activeGatewayId) {
        newErrors.gateway_id =
          errors.gateway_id || 'Select a gateway for this facility';
      }

      if (selectedDeviceType === 'access_control') {
        if (!accessControlData.name.trim()) newErrors.name = 'Device name is required';
        if (!accessControlData.device_serial.trim()) newErrors.device_serial = 'Hardware serial is required';
        if (!accessControlData.location_description.trim()) {
          newErrors.location_description = 'Location description is required';
        }
        if (!accessControlData.relay_channel || accessControlData.relay_channel < 1 || accessControlData.relay_channel > 8) {
          newErrors.relay_channel = 'Relay channel must be between 1 and 8';
        }
      } else if (selectedDeviceType === 'blulok') {
        if (!bluLokData.device_serial.trim()) newErrors.device_serial = 'Hardware serial is required';
        if (bluLokData.lock_number.trim()) {
          const n = Number(bluLokData.lock_number);
          if (!Number.isFinite(n)) newErrors.lock_number = 'Lock number must be numeric';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const goBack = () => {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const handleFacilityChange = async (fid: string) => {
    setSelectedFacility(fid);
    setGateways([]);
    applyGatewaySelection('');
    if (fid) {
      await loadGatewaysForFacility(fid);
      await loadUnits(fid);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep('review') || !selectedDeviceType) return;

    try {
      setLoading(true);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.submit;
        return next;
      });

      if (selectedDeviceType === 'access_control') {
        await apiService.createAccessControlDevice({
          gateway_id: accessControlData.gateway_id,
          device_serial: accessControlData.device_serial.trim(),
          name: accessControlData.name.trim(),
          device_type: accessControlData.device_type,
          location_description: accessControlData.location_description.trim(),
          relay_channel: accessControlData.relay_channel,
          access_methods: accessControlData.access_methods,
          supports_remote_lock: accessControlData.supports_remote_lock,
          supports_widget_timed_open: accessControlData.supports_widget_timed_open,
          has_lock_feedback: accessControlData.has_lock_feedback,
          no_feedback_open_timeout_sec: accessControlData.has_lock_feedback
            ? 0
            : accessControlData.no_feedback_open_timeout_sec,
        });
      } else {
        const deviceSettings = buildBluLokDeviceSettings(undefined, {
          lockNumber: bluLokData.lock_number,
          displayName: bluLokData.display_name,
          locationDescription: bluLokData.location_description,
        });
        const payload: Record<string, unknown> = {
          gateway_id: bluLokData.gateway_id,
          device_serial: bluLokData.device_serial.trim(),
        };
        if (bluLokData.unit_id) payload.unit_id = bluLokData.unit_id;
        if (bluLokData.serial.trim()) payload.serial = bluLokData.serial.trim();
        if (bluLokData.display_name.trim()) payload.name = bluLokData.display_name.trim();
        if (bluLokData.firmware_version.trim()) {
          payload.firmware_version = bluLokData.firmware_version.trim();
        }
        if (bluLokData.supports_remote_lock) payload.supports_remote_lock = true;
        if (Object.keys(deviceSettings).length > 0) payload.device_settings = deviceSettings;
        await apiService.createBluLokDevice(payload);
      }

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Failed to create device:', error);
      const apiMessage = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.response?.data?.error)
        : undefined;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const fallback = apiMessage || 'Failed to create device. Please try again.';
      setErrors(
        status === 409 || status === 400
          ? mapDeviceApiErrorToFields(String(fallback))
          : { submit: fallback }
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const selectedFacilityName = facilities.find((f) => f.id === selectedFacility)?.name || '';
  const selectedUnit = units.find((u) => u.id === bluLokData.unit_id);
  const selectedGateway = gateways.find(
    (g) => g.id === (selectedDeviceType === 'access_control' ? accessControlData.gateway_id : bluLokData.gateway_id)
  );

  const renderGatewayField = () => {
    if (gateways.length === 0) {
      return errors.gateway_id ? (
        <p className="text-sm text-red-600 dark:text-red-400">{errors.gateway_id}</p>
      ) : null;
    }

    if (gateways.length === 1) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <WifiIcon className="h-4 w-4 shrink-0" />
          <span>
            Gateway: <strong>{gateways[0].name}</strong>
          </span>
        </div>
      );
    }

    const gatewayId =
      selectedDeviceType === 'access_control'
        ? accessControlData.gateway_id
        : bluLokData.gateway_id;

    return (
      <div>
        <label
          htmlFor="add-device-gateway"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Gateway <span className="text-red-500">*</span>
        </label>
        <select
          id="add-device-gateway"
          value={gatewayId}
          onChange={(e) => applyGatewaySelection(e.target.value)}
          className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-gray-900 dark:bg-gray-700 dark:text-white ${
            errors.gateway_id ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          {gateways.map((gateway) => (
            <option key={gateway.id} value={gateway.id}>
              {gateway.name}
              {gateway.status ? ` (${gateway.status})` : ''}
            </option>
          ))}
        </select>
        {errors.gateway_id && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.gateway_id}</p>
        )}
      </div>
    );
  };

  const renderTypeStep = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-semibold text-gray-900 dark:text-white">What are you adding?</h4>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manual devices are never removed by gateway inventory sync — only auto-discovered hardware is reconciled.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {HARDWARE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = selectedDeviceType === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setSelectedDeviceType(option.id);
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.type;
                  return next;
                });
              }}
              className={`group relative overflow-hidden rounded-xl border-2 p-5 text-left transition-all duration-200 hover:scale-[1.01] hover:shadow-md ${
                selected
                  ? 'border-primary-500 bg-gradient-to-br from-primary-500/10 to-primary-600/5 shadow-sm'
                  : `border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gradient-to-br ${option.accent}`
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`rounded-xl p-3 transition-colors ${
                    selected
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-500 group-hover:text-primary-600'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{option.title}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {errors.type && <p className="text-sm text-red-600 dark:text-red-400">{errors.type}</p>}
    </div>
  );

  const renderLocationStep = () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-semibold text-gray-900 dark:text-white">Where does this device live?</h4>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Devices connect through the facility gateway — we resolve it automatically.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Facility *</label>
        <div className="relative">
          <BuildingOfficeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <select
            value={selectedFacility}
            onChange={(e) => void handleFacilityChange(e.target.value)}
            className={`block w-full pl-10 pr-3 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
              errors.facility || errors.gateway_id ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            <option value="">Select a facility</option>
            {facilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.name}
              </option>
            ))}
          </select>
        </div>
        {errors.facility && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.facility}</p>}
        {errors.gateway_id && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.gateway_id}</p>}
      </div>
      {selectedFacilityName && !errors.gateway_id && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <WifiIcon className="h-4 w-4 shrink-0" />
          Gateway linked to <strong className="mx-1">{selectedFacilityName}</strong>
        </div>
      )}
    </div>
  );

  const renderConfigureStep = () => (
    <div className="space-y-5">
      {selectedDeviceType === 'access_control' ? (
        <>
          <h4 className="text-base font-semibold text-gray-900 dark:text-white">Access control device details</h4>
          {renderGatewayField()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name *</label>
              <input
                type="text"
                value={accessControlData.name}
                onChange={(e) => setAccessControlData((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
                placeholder="Main gate keypad"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Controller type *</label>
              <div className="grid grid-cols-3 gap-2">
                {ACCESS_DEVICE_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAccessControlData((p) => ({ ...p, device_type: value }))}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                      accessControlData.device_type === value
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Hardware serial (access_id) *
            </label>
            <input
              type="text"
              value={accessControlData.device_serial}
              onChange={(e) => setAccessControlData((p) => ({ ...p, device_serial: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 font-mono text-sm"
              placeholder="KP-7F2A-001"
            />
            {errors.device_serial && <p className="mt-1 text-sm text-red-600">{errors.device_serial}</p>}
            <p className="mt-1 text-xs text-gray-500">Unique per relay on this gateway (matches gateway <code className="font-mono">access_id</code>).</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Relay channel *</label>
              <input
                type="number"
                min={1}
                max={8}
                value={accessControlData.relay_channel}
                onChange={(e) =>
                  setAccessControlData((p) => ({ ...p, relay_channel: parseInt(e.target.value, 10) || 1 }))
                }
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2"
              />
              {errors.relay_channel && <p className="mt-1 text-sm text-red-600">{errors.relay_channel}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location *</label>
              <input
                type="text"
                value={accessControlData.location_description}
                onChange={(e) => setAccessControlData((p) => ({ ...p, location_description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2"
                placeholder="North parking gate"
              />
              {errors.location_description && <p className="mt-1 text-sm text-red-600">{errors.location_description}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Access methods</label>
            <div className="flex flex-wrap gap-2">
              {(['app', 'keypad', 'fob'] as const).map((method) => {
                const checked = accessControlData.access_methods.includes(method);
                return (
                  <label
                    key={method}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize transition-colors ${
                      checked
                        ? 'border-primary-400 bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setAccessControlData((prev) => {
                          const next = e.target.checked
                            ? Array.from(new Set([...prev.access_methods, method]))
                            : prev.access_methods.filter((m) => m !== method);
                          return { ...prev, access_methods: next.length ? next : ['app'] };
                        });
                      }}
                      className="rounded border-gray-300 text-primary-600"
                    />
                    {method}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={accessControlData.supports_remote_lock}
                onChange={(e) =>
                  setAccessControlData((p) => ({ ...p, supports_remote_lock: e.target.checked }))
                }
                className="rounded border-gray-300 text-primary-600"
              />
              Supports remote lock (CLOSE) from cloud
            </label>
          </div>
          <div className="flex items-center">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={accessControlData.supports_widget_timed_open}
                onChange={(e) =>
                  setAccessControlData((p) => ({ ...p, supports_widget_timed_open: e.target.checked }))
                }
                className="rounded border-gray-300 text-primary-600"
              />
              Enable timed open for Remote Gate widget
            </label>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/30">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={accessControlData.has_lock_feedback}
                onChange={(e) =>
                  setAccessControlData((p) => ({
                    ...p,
                    has_lock_feedback: e.target.checked,
                    no_feedback_open_timeout_sec: e.target.checked
                      ? 0
                      : p.no_feedback_open_timeout_sec,
                  }))
                }
                className="rounded border-gray-300 text-primary-600"
              />
              Hardware reports open/closed state
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Disable for relay-only access points that cannot report state. Cloud owns open/closed until the timeout below.
            </p>
            {!accessControlData.has_lock_feedback && (
              <div className="mt-3 max-w-xs">
                <label
                  htmlFor="add-access-control-no-feedback-timeout"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Assume open for (seconds)
                </label>
                <input
                  id="add-access-control-no-feedback-timeout"
                  type="number"
                  min={0}
                  max={NO_FEEDBACK_OPEN_TIMEOUT_MAX_SEC}
                  value={accessControlData.no_feedback_open_timeout_sec}
                  onChange={(e) =>
                    setAccessControlData((p) => ({
                      ...p,
                      no_feedback_open_timeout_sec: Math.max(
                        0,
                        Math.min(
                          NO_FEEDBACK_OPEN_TIMEOUT_MAX_SEC,
                          Number(e.target.value) || 0,
                        ),
                      ),
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Use 0 to keep the device logically closed so Open is always available.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div>
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">BluLok lock details</h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The hardware serial is the primary identifier for gateway commands and inventory sync.
            </p>
          </div>

          {renderGatewayField()}

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 p-4 space-y-4">
            <div>
              <label
                htmlFor="add-blulok-serial"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Hardware serial (lock_id) <span className="text-red-500">*</span>
              </label>
              <input
                id="add-blulok-serial"
                type="text"
                value={bluLokData.device_serial}
                onChange={(e) => setBluLokData((p) => ({ ...p, device_serial: e.target.value }))}
                className={`w-full rounded-lg border bg-white dark:bg-gray-700 px-3 py-2.5 font-mono text-sm text-gray-900 dark:text-white ${
                  errors.device_serial ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="e.g. BL-2024-001234"
                autoComplete="off"
              />
              {errors.device_serial && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.device_serial}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="add-blulok-lock-number"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Lock number <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="add-blulok-lock-number"
                  type="number"
                  value={bluLokData.lock_number}
                  onChange={(e) => setBluLokData((p) => ({ ...p, lock_number: e.target.value }))}
                  className={`w-full rounded-lg border bg-white dark:bg-gray-700 px-3 py-2.5 text-gray-900 dark:text-white ${
                    errors.lock_number ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="2453"
                />
                {errors.lock_number && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lock_number}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="add-blulok-secondary-serial"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Secondary serial <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="add-blulok-secondary-serial"
                  type="text"
                  value={bluLokData.serial}
                  onChange={(e) => setBluLokData((p) => ({ ...p, serial: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 font-mono text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="add-blulok-display-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Display name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="add-blulok-display-name"
                type="text"
                value={bluLokData.display_name}
                onChange={(e) => setBluLokData((p) => ({ ...p, display_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 text-gray-900 dark:text-white"
                placeholder="Friendly label for admins (defaults to serial in lists)"
              />
            </div>

            <div>
              <label
                htmlFor="add-blulok-firmware"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Firmware <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="add-blulok-firmware"
                type="text"
                value={bluLokData.firmware_version}
                onChange={(e) => setBluLokData((p) => ({ ...p, firmware_version: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 text-gray-900 dark:text-white"
                placeholder="v2.1.0"
              />
            </div>

            <div>
              <label
                htmlFor="add-blulok-location"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Location note <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="add-blulok-location"
                type="text"
                value={bluLokData.location_description}
                onChange={(e) => setBluLokData((p) => ({ ...p, location_description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 text-gray-900 dark:text-white"
              />
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={bluLokData.supports_remote_lock}
                onChange={(e) =>
                  setBluLokData((p) => ({ ...p, supports_remote_lock: e.target.checked }))
                }
                className="rounded border-gray-300 text-primary-600"
              />
              Supports remote lock (CLOSE) from cloud
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div>
              <label
                htmlFor="add-blulok-unit"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Unit assignment <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <HomeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                <select
                  id="add-blulok-unit"
                  value={bluLokData.unit_id}
                  onChange={(e) => setBluLokData((p) => ({ ...p, unit_id: e.target.value }))}
                  className="block w-full appearance-none pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Unassigned — assign later from device details</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      Unit {unit.unit_number} — {unit.unit_type}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Leave unassigned when staging inventory before move-in, or assign from the unit page later.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
            <LockClosedIcon className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Manually added locks are protected from gateway inventory removal until you delete them in the cloud.
            </span>
          </div>
        </>
      )}
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <h4 className="text-base font-semibold text-gray-900 dark:text-white">Review & create</h4>
      <dl className="divide-y divide-gray-200 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {[
          ['Hardware', selectedDeviceType === 'blulok' ? 'BluLok lock' : 'Access control'],
          ['Facility', selectedFacilityName || facilityId || '—'],
          ['Gateway', selectedGateway?.name || '—'],
          ...(selectedDeviceType === 'blulok'
            ? [
                ['Serial (lock_id)', bluLokData.device_serial],
                ['Lock number', bluLokData.lock_number || '—'],
                ['Secondary serial', bluLokData.serial || '—'],
                ['Display name', bluLokData.display_name.trim() || bluLokData.device_serial || '—'],
                ['Location', bluLokData.location_description || '—'],
                ['Unit', selectedUnit ? `Unit ${selectedUnit.unit_number}` : 'Unassigned'],
                ['Firmware', bluLokData.firmware_version || '—'],
                ['Remote lock', bluLokData.supports_remote_lock ? 'Yes' : 'No'],
              ]
            : [
                ['Name', accessControlData.name],
                ['Type', accessControlData.device_type],
                ['Serial (access_id)', accessControlData.device_serial],
                ['Relay', `#${accessControlData.relay_channel}`],
                ['Location', accessControlData.location_description],
                ['Access', accessControlData.access_methods.join(', ')],
                ['Remote lock', accessControlData.supports_remote_lock ? 'Yes' : 'No'],
                ['Widget timed open', accessControlData.supports_widget_timed_open ? 'Yes' : 'No'],
                ['Lock feedback', accessControlData.has_lock_feedback ? 'Reported by hardware' : 'Not available'],
                ...(!accessControlData.has_lock_feedback
                  ? [[
                      'Assume open',
                      accessControlData.no_feedback_open_timeout_sec > 0
                        ? `${accessControlData.no_feedback_open_timeout_sec} seconds`
                        : 'Never (always ready)',
                    ]]
                  : []),
              ]),
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 bg-gray-50/50 dark:bg-gray-900/20 px-4 py-3 text-sm">
            <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="font-medium text-gray-900 dark:text-white text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        This device will be marked as manually provisioned and protected from gateway inventory removal.
      </p>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" title="Add device">
      <div className="px-6 sm:px-8 pt-6 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary-100 dark:bg-primary-900/30 p-2.5">
            <PlusCircleIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Add device manually</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Register hardware that is not auto-discovered by the gateway.</p>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-8 py-6">
        <StepIndicator steps={steps} current={step} />
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'type' && renderTypeStep()}
            {step === 'location' && renderLocationStep()}
            {step === 'configure' && renderConfigureStep()}
            {step === 'review' && renderReviewStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-6 sm:px-8 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={step === steps[0] ? handleClose : goBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          {step === steps[0] ? (
            'Cancel'
          ) : (
            <>
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </>
          )}
        </button>
        {step === 'review' ? (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating…' : 'Create device'}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            Continue
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {errors.submit && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
        </div>
      )}
    </Modal>
  );
}
