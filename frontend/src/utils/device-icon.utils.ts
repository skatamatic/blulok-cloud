import type { ForwardRefExoticComponent, SVGProps } from 'react';
import {
  BoltIcon,
  CpuChipIcon,
  CubeIcon,
  KeyIcon,
  LockClosedIcon,
  ServerIcon,
  SignalIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import type { AccessControlDevice, NetworkInfraDevice } from '@/types/facility.types';

export type HeroOutlineIcon = ForwardRefExoticComponent<
  Omit<SVGProps<SVGSVGElement>, 'ref'> & { title?: string; titleId?: string }
>;

export type AccessControlDeviceType = AccessControlDevice['device_type'];
export type NetworkInfraDeviceKind = NetworkInfraDevice['device_kind'];

export interface DeviceIconMeta {
  Icon: HeroOutlineIcon;
  containerClass: string;
  iconClass: string;
  badgeClass: string;
  label: string;
}

export const ACCESS_CONTROL_DEVICE_TYPE_ICONS: Record<AccessControlDeviceType, HeroOutlineIcon> = {
  gate: BoltIcon,
  elevator: CubeIcon,
  door: KeyIcon,
};

export const ACCESS_CONTROL_DEVICE_TYPE_LABELS: Record<AccessControlDeviceType, string> = {
  gate: 'Gate',
  elevator: 'Elevator',
  door: 'Door',
};

export const NETWORK_INFRA_KIND_ICONS: Record<NetworkInfraDeviceKind, HeroOutlineIcon> = {
  gateway: ServerIcon,
  bridge: SignalIcon,
  friend_node: WifiIcon,
};

export const NETWORK_INFRA_KIND_LABELS: Record<NetworkInfraDeviceKind, string> = {
  gateway: 'Gateway',
  bridge: 'Bridge',
  friend_node: 'Friend Node',
};

export const ACCESS_DEVICE_TYPE_OPTIONS = [
  {
    value: 'gate' as const,
    label: ACCESS_CONTROL_DEVICE_TYPE_LABELS.gate,
    description: 'Vehicle or pedestrian gate',
    Icon: ACCESS_CONTROL_DEVICE_TYPE_ICONS.gate,
  },
  {
    value: 'elevator' as const,
    label: ACCESS_CONTROL_DEVICE_TYPE_LABELS.elevator,
    description: 'Elevator floor relay',
    Icon: ACCESS_CONTROL_DEVICE_TYPE_ICONS.elevator,
  },
  {
    value: 'door' as const,
    label: ACCESS_CONTROL_DEVICE_TYPE_LABELS.door,
    description: 'Entry or interior door',
    Icon: ACCESS_CONTROL_DEVICE_TYPE_ICONS.door,
  },
] as const;

const BLULOK_META: DeviceIconMeta = {
  Icon: LockClosedIcon,
  containerClass: 'bg-blue-100 dark:bg-blue-900/20',
  iconClass: 'text-blue-600 dark:text-blue-400',
  badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  label: 'BluLok',
};

const ACCESS_CONTROL_DEFAULT_META: DeviceIconMeta = {
  Icon: CpuChipIcon,
  containerClass: 'bg-primary-100 dark:bg-primary-900/20',
  iconClass: 'text-primary-600 dark:text-primary-400',
  badgeClass: 'bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400',
  label: 'Access Control',
};

const NETWORK_INFRA_CONTAINER = 'bg-indigo-100 dark:bg-indigo-900/20';
const NETWORK_INFRA_ICON = 'text-indigo-600 dark:text-indigo-400';
const NETWORK_INFRA_BADGE = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400';

export type DeviceIconInput =
  | { device_category: 'blulok' }
  | { device_category: 'access_control'; device_type?: AccessControlDeviceType | string | null }
  | { device_category: 'network_infra'; device_kind: NetworkInfraDeviceKind | string };

export function getAccessControlDeviceTypeIcon(
  deviceType?: AccessControlDeviceType | string | null,
): HeroOutlineIcon {
  if (deviceType && deviceType in ACCESS_CONTROL_DEVICE_TYPE_ICONS) {
    return ACCESS_CONTROL_DEVICE_TYPE_ICONS[deviceType as AccessControlDeviceType];
  }
  return ACCESS_CONTROL_DEFAULT_META.Icon;
}

export function formatAccessControlDeviceTypeLabel(
  deviceType?: AccessControlDeviceType | string | null,
): string {
  if (deviceType && deviceType in ACCESS_CONTROL_DEVICE_TYPE_LABELS) {
    return ACCESS_CONTROL_DEVICE_TYPE_LABELS[deviceType as AccessControlDeviceType];
  }
  return ACCESS_CONTROL_DEFAULT_META.label;
}

export function formatNetworkInfraKindLabel(
  deviceKind?: NetworkInfraDeviceKind | string | null,
): string {
  if (deviceKind && deviceKind in NETWORK_INFRA_KIND_LABELS) {
    return NETWORK_INFRA_KIND_LABELS[deviceKind as NetworkInfraDeviceKind];
  }
  if (!deviceKind) return 'Network Device';
  return deviceKind.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getNetworkInfraKindIcon(
  deviceKind?: NetworkInfraDeviceKind | string | null,
): HeroOutlineIcon {
  if (deviceKind && deviceKind in NETWORK_INFRA_KIND_ICONS) {
    return NETWORK_INFRA_KIND_ICONS[deviceKind as NetworkInfraDeviceKind];
  }
  return ServerIcon;
}

export function getDeviceIconMeta(device: DeviceIconInput): DeviceIconMeta {
  if (device.device_category === 'network_infra') {
    const kind = device.device_kind as NetworkInfraDeviceKind;
    return {
      Icon: getNetworkInfraKindIcon(kind),
      containerClass: NETWORK_INFRA_CONTAINER,
      iconClass: NETWORK_INFRA_ICON,
      badgeClass: NETWORK_INFRA_BADGE,
      label: formatNetworkInfraKindLabel(kind),
    };
  }

  if (device.device_category === 'blulok') {
    return BLULOK_META;
  }

  const deviceType = device.device_type;
  return {
    Icon: getAccessControlDeviceTypeIcon(deviceType),
    containerClass: ACCESS_CONTROL_DEFAULT_META.containerClass,
    iconClass: ACCESS_CONTROL_DEFAULT_META.iconClass,
    badgeClass: ACCESS_CONTROL_DEFAULT_META.badgeClass,
    label: formatAccessControlDeviceTypeLabel(deviceType),
  };
}

export function getDeviceListTypeLabel(device: DeviceIconInput): string {
  return getDeviceIconMeta(device).label;
}
