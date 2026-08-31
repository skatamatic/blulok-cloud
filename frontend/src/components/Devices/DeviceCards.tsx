import { useNavigate } from 'react-router-dom';
import { LockClosedIcon, LockOpenIcon, QuestionMarkCircleIcon, CheckCircleIcon, ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { AccessControlDevice, BluLokDevice, NetworkInfraDevice } from '@/types/facility.types';
import { DeviceTypeIcon } from '@/components/Common/DeviceTypeIcon';
import { formatNetworkInfraKindLabel, getDeviceIconMeta } from '@/utils/device-icon.utils';
import { formatAccessDeviceListSubtitle } from '@/utils/accessDeviceDisplay.utils';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  formatBluLokDeviceSubtitle,
  formatBluLokUserFacingLabel,
} from '@/utils/blulokDeviceDisplay.utils';

const statusColors = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
};

const statusIcons = {
  online: CheckCircleIcon,
  offline: ExclamationTriangleIcon,
  error: ExclamationTriangleIcon,
  maintenance: ExclamationTriangleIcon,
  low_battery: ExclamationTriangleIcon
};

/**
 * Access control device card: read-only summary; entire card navigates to device details.
 */
export function AccessControlDeviceCard({ device, groupNames = [], onViewDevice }: {
  device: AccessControlDevice;
  /** Optional override navigation (e.g. return-path state). */
  onViewDevice?: () => void;
  groupNames?: string[];
}) {
  const navigate = useNavigate();
  const StatusIcon = (statusIcons as Record<string, typeof CheckCircleIcon>)[device.status] || CheckCircleIcon;
  const accessMethods =
    device.access_methods && device.access_methods.length > 0 ? device.access_methods : ['app'];
  const iconMeta = getDeviceIconMeta({ device_category: 'access_control', device_type: device.device_type });

  return (
    <div
      id={`device-${device.id}`}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewDevice ? onViewDevice() : navigate(`/devices/${device.id}`);
        }
      }}
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-[1.01] hover:bg-blue-50 dark:hover:bg-blue-900/20"
      onClick={() => (onViewDevice ? onViewDevice() : navigate(`/devices/${device.id}`))}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <DeviceTypeIcon
            device={{ device_category: 'access_control', device_type: device.device_type }}
            size="lg"
            className="mr-4"
            meta={iconMeta}
          />
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{device.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {formatAccessDeviceListSubtitle(device)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{iconMeta.label} Controller</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(statusColors as Record<string, string>)[device.status] || statusColors.unknown}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {device.status}
          </span>
        </div>
      </div>

      {device.location_description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{device.location_description}</p>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {accessMethods.map((method) => (
            <span
              key={method}
              className="inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 capitalize"
            >
              {method}
            </span>
          ))}
        </div>
        {groupNames && groupNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Groups:</span>
            {groupNames.map((groupName) => (
              <span
                key={groupName}
                className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300"
              >
                {groupName}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Hardware Serial</span>
          <span className="font-mono font-medium text-gray-900 dark:text-white">{device.device_serial}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Relay Channel</span>
          <span className="font-medium text-gray-900 dark:text-white">#{device.relay_channel}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Lock Status</span>
          <span className={`font-medium ${device.is_locked ? 'text-red-600' : 'text-green-600'}`}>
            {device.is_locked ? 'Locked' : 'Unlocked'}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * BluLok device card: read-only summary; entire card navigates to device details.
 */
export function BluLokDeviceCard({ device, onViewDevice }: {
  device: BluLokDevice;
  onViewDevice?: () => void;
}) {
  const navigate = useNavigate();
  const StatusIcon = (statusIcons as Record<string, typeof CheckCircleIcon>)[device.device_status] || CheckCircleIcon;

  const handleCardClick = () => {
    if (onViewDevice) {
      onViewDevice();
    } else {
      navigate(`/devices/${device.id}`);
    }
  };

  return (
    <div
      id={`device-${device.id}`}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-[1.01] hover:bg-blue-50 dark:hover:bg-blue-900/20"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <DeviceTypeIcon device={{ device_category: 'blulok' }} size="lg" className="mr-4" />
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              {formatBluLokUserFacingLabel(device)}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatBluLokDeviceSubtitle(device)}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(statusColors as Record<string, string>)[device.device_status] || statusColors.unknown}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {device.device_status}
          </span>
        </div>
      </div>

      {device.primary_tenant && (
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
          <span>
            {device.primary_tenant.first_name} {device.primary_tenant.last_name}
          </span>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Lock Status</span>
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${(statusColors as Record<string, string>)[device.lock_status] || statusColors.unknown}`}>
            {device.lock_status === 'locked' ? <LockClosedIcon className="h-3 w-3 mr-1" /> : 
             device.lock_status === 'unlocked' ? <LockOpenIcon className="h-3 w-3 mr-1" /> :
             <QuestionMarkCircleIcon className="h-3 w-3 mr-1" />}
            {device.lock_status}
          </span>
        </div>
      </div>
    </div>
  );
}

const networkInfraKindLabels: Record<NetworkInfraDevice['device_kind'], string> = {
  gateway: formatNetworkInfraKindLabel('gateway'),
  bridge: formatNetworkInfraKindLabel('bridge'),
  friend_node: formatNetworkInfraKindLabel('friend_node'),
};

export function NetworkInfraDeviceCard({
  device,
  canManage = false,
  onDelete,
  onManageGateway,
}: {
  device: NetworkInfraDevice;
  canManage?: boolean;
  onDelete?: (device: NetworkInfraDevice) => void;
  onManageGateway?: () => void;
}) {
  const iconMeta = getDeviceIconMeta({
    device_category: 'network_infra',
    device_kind: device.device_kind,
  });
  const StatusIcon = (statusIcons as Record<string, typeof CheckCircleIcon>)[device.status] || CheckCircleIcon;
  const displayTitle =
    device.device_kind === 'gateway' ? device.name : networkInfraKindLabels[device.device_kind];

  return (
    <div
      id={`device-${device.id}`}
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <DeviceTypeIcon
            device={{ device_category: 'network_infra', device_kind: device.device_kind }}
            size="lg"
            className="mr-4"
            meta={iconMeta}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{displayTitle}</h3>
              {!device.deletable && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                  Read-only
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{device.device_serial}</p>
            {device.device_kind === 'gateway' && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{iconMeta.label}</p>
            )}
          </div>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(statusColors as Record<string, string>)[device.status] || statusColors.unknown}`}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {device.status}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        {device.firmware_version && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Firmware</span>
            <span className="font-medium text-gray-900 dark:text-white">{device.firmware_version}</span>
          </div>
        )}
        {device.last_seen && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Last seen</span>
            <span className="font-medium text-gray-900 dark:text-white">{formatDateTime(device.last_seen)}</span>
          </div>
        )}
        {device.facility_name && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Facility</span>
            <span className="font-medium text-gray-900 dark:text-white">{device.facility_name}</span>
          </div>
        )}
        {device.gateway_name && device.device_kind !== 'gateway' && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Gateway</span>
            <span className="font-medium text-gray-900 dark:text-white">{device.gateway_name}</span>
          </div>
        )}
      </div>

      {(device.device_kind === 'gateway' && onManageGateway) || (canManage && device.deletable && onDelete) ? (
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
        {device.device_kind === 'gateway' && onManageGateway && (
          <button
            type="button"
            onClick={onManageGateway}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            Manage gateway
          </button>
        )}
        {canManage && device.deletable && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(device)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <TrashIcon className="h-4 w-4 mr-1" />
            Remove
          </button>
        )}
      </div>
      ) : null}
    </div>
  );
}
