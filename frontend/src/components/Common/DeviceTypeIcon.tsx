import React from 'react';
import {
  DeviceIconInput,
  DeviceIconMeta,
  getDeviceIconMeta,
} from '@/utils/device-icon.utils';

export type DeviceTypeIconSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<
  DeviceTypeIconSize,
  { wrap: string; icon: string }
> = {
  sm: { wrap: 'p-2', icon: 'h-4 w-4' },
  md: { wrap: 'p-2.5', icon: 'h-5 w-5' },
  lg: { wrap: 'p-3', icon: 'h-6 w-6' },
};

export interface DeviceTypeIconProps {
  device: DeviceIconInput;
  size?: DeviceTypeIconSize;
  className?: string;
  meta?: DeviceIconMeta;
}

export const DeviceTypeIcon: React.FC<DeviceTypeIconProps> = ({
  device,
  size = 'sm',
  className = '',
  meta: metaOverride,
}) => {
  const meta = metaOverride ?? getDeviceIconMeta(device);
  const { Icon } = meta;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg ${sizeClass.wrap} ${meta.containerClass} ${className}`.trim()}
      aria-hidden
    >
      <Icon className={`${sizeClass.icon} ${meta.iconClass}`} />
    </div>
  );
};

export interface DeviceTypeBadgeProps {
  device: DeviceIconInput;
  className?: string;
  meta?: DeviceIconMeta;
}

export const DeviceTypeBadge: React.FC<DeviceTypeBadgeProps> = ({
  device,
  className = '',
  meta: metaOverride,
}) => {
  const meta = metaOverride ?? getDeviceIconMeta(device);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass} ${className}`.trim()}
    >
      {meta.label}
    </span>
  );
};
