import {
  bluLokDeviceAvatarLabel,
  BluLokDeviceDisplayFields,
  formatBluLokDeviceSubtitle,
  formatBluLokUserFacingLabel,
} from '@/utils/blulokDeviceDisplay.utils';

interface BluLokDeviceSummaryProps {
  device: BluLokDeviceDisplayFields;
  status?: string;
  className?: string;
}

export function BluLokDeviceSummary({ device, status, className = '' }: BluLokDeviceSummaryProps) {
  return (
    <div className={`flex items-center justify-between min-w-0 ${className}`}>
      <div className="flex items-center space-x-2 min-w-0">
        <div className="flex-shrink-0 h-8 w-8 bg-primary-100 dark:bg-primary-900/20 rounded-full flex items-center justify-center">
          <span className="text-xs font-semibold text-primary-800 dark:text-primary-200">
            {bluLokDeviceAvatarLabel(device)}
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {formatBluLokUserFacingLabel(device)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {formatBluLokDeviceSubtitle(device)}
          </div>
        </div>
      </div>
      {status ? (
        <div className="flex-shrink-0 ml-2 text-xs text-gray-500 dark:text-gray-400 capitalize">
          {status}
        </div>
      ) : null}
    </div>
  );
}
