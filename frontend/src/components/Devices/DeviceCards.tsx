import { MouseEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CpuChipIcon, LockClosedIcon, LockOpenIcon, QuestionMarkCircleIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { AccessControlDevice, BluLokDevice } from '@/types/facility.types';

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

export function AccessControlDeviceCard({ device, onViewFacility, onViewDevice }: {
  device: AccessControlDevice;
  onViewFacility?: () => void;
  onViewDevice?: () => void;
}) {
  const navigate = useNavigate();
  const StatusIcon = (statusIcons as any)[device.status] || CheckCircleIcon;
  return (
    <div
      id={`device-${device.id}`}
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-[1.01] hover:bg-blue-50 dark:hover:bg-blue-900/20"
      onClick={() => onViewDevice ? onViewDevice() : navigate(`/devices/${device.id}`)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg mr-4">
            <CpuChipIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{device.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{device.device_type} Controller</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(statusColors as any)[device.status] || statusColors.unknown}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {device.status}
          </span>
        </div>
      </div>

      {device.location_description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{device.location_description}</p>
      )}

      <div className="space-y-3">
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

      {(onViewFacility || onViewDevice) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {onViewFacility && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewFacility();
              }}
              className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              View Facility
            </button>
          )}
          {onViewDevice && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewDevice();
              }}
              className="inline-flex items-center rounded-lg border border-transparent bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            >
              View Details
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function BluLokDeviceCard({ device, onViewDevice, onViewUnit, canManage, onToggleLock }: {
  device: BluLokDevice;
  onViewDevice?: () => void;
  onViewUnit?: () => void;
  canManage?: boolean;
  onToggleLock?: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const StatusIcon = (statusIcons as any)[device.device_status] || CheckCircleIcon;
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleLock = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!onToggleLock) return;
    try {
      setIsToggling(true);
      await onToggleLock();
    } finally {
      setIsToggling(false);
    }
  };

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
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 transition-all duration-200 cursor-pointer hover:shadow-lg hover:scale-[1.01] hover:bg-blue-50 dark:hover:bg-blue-900/20"
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg mr-4">
            <LockClosedIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Unit {device.unit_number}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{device.device_serial}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(statusColors as any)[device.device_status] || statusColors.unknown}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {device.device_status}
          </span>
        </div>
      </div>

      {device.primary_tenant && (
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
          <CpuChipIcon className="h-4 w-4 mr-2" />
          <span>
            {device.primary_tenant.first_name} {device.primary_tenant.last_name}
          </span>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Lock Status</span>
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${(statusColors as any)[device.lock_status] || statusColors.unknown}`}>
            {device.lock_status === 'locked' ? <LockClosedIcon className="h-3 w-3 mr-1" /> : 
             device.lock_status === 'unlocked' ? <LockOpenIcon className="h-3 w-3 mr-1" /> :
             <QuestionMarkCircleIcon className="h-3 w-3 mr-1" />}
            {device.lock_status}
          </span>
        </div>
      </div>

      {(onViewUnit || onViewDevice || (canManage && onToggleLock)) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {onViewUnit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewUnit();
              }}
              className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              View Unit
            </button>
          )}
          {onViewDevice && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onViewDevice();
              }}
              className="inline-flex items-center rounded-lg border border-transparent bg-primary-50 dark:bg-primary-900/20 px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            >
              View Details
            </button>
          )}
          {canManage && onToggleLock && (
            <button
              type="button"
              onClick={handleToggleLock}
              disabled={isToggling}
              className="inline-flex items-center rounded-lg border border-transparent bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {isToggling ? 'Updating…' : device.lock_status === 'locked' ? 'Unlock' : 'Lock'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}


