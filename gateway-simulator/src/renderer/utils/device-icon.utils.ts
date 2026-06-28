import type { ComponentType, SVGProps } from 'react';
import {
  CircleStackIcon,
  CpuChipIcon,
  LockClosedIcon,
  LockOpenIcon,
  SignalIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import type { GatewayInventoryKind } from '@protocol/device-kinds';
import { ADDABLE_INVENTORY_KINDS } from '@protocol/device-kinds';

export type HeroOutlineIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface InventoryKindIconMeta {
  Icon: HeroOutlineIcon;
  containerClass: string;
  iconClass: string;
  label: string;
  description: string;
}

/** Icon styling aligned with frontend `DeviceTypeIcon` / `device-icon.utils`. */
const BLULOK_META: InventoryKindIconMeta = {
  Icon: LockClosedIcon,
  containerClass: 'bg-blue-100 dark:bg-blue-900/20',
  iconClass: 'text-blue-600 dark:text-blue-400',
  label: 'BluLok',
  description: 'Storage unit lock',
};

const ACCESS_CONTROL_META: InventoryKindIconMeta = {
  Icon: CpuChipIcon,
  containerClass: 'bg-primary-100 dark:bg-primary-900/20',
  iconClass: 'text-primary-600 dark:text-primary-400',
  label: 'Access control',
  description: 'Gate, door, or elevator relay',
};

const NETWORK_INFRA_CONTAINER = 'bg-indigo-100 dark:bg-indigo-900/20';
const NETWORK_INFRA_ICON = 'text-indigo-600 dark:text-indigo-400';

const INVENTORY_KIND_ICON_META: Record<
  Exclude<GatewayInventoryKind, 'gateway'>,
  InventoryKindIconMeta
> = {
  lock: BLULOK_META,
  access_control: ACCESS_CONTROL_META,
  bridge: {
    Icon: SignalIcon,
    containerClass: NETWORK_INFRA_CONTAINER,
    iconClass: NETWORK_INFRA_ICON,
    label: 'Bridge',
    description: 'Mesh bridge relay',
  },
  friend_node: {
    Icon: WifiIcon,
    containerClass: NETWORK_INFRA_CONTAINER,
    iconClass: NETWORK_INFRA_ICON,
    label: 'Friend node',
    description: 'Mesh friend node',
  },
};

const GATEWAY_META: InventoryKindIconMeta = {
  Icon: CircleStackIcon,
  containerClass: 'bg-primary-100 dark:bg-primary-900/20',
  iconClass: 'text-primary-600 dark:text-primary-400',
  label: 'Gateway',
  description: 'Gateway session device',
};

export function getInventoryKindIconMeta(
  kind: Exclude<GatewayInventoryKind, 'gateway'>,
): InventoryKindIconMeta {
  return INVENTORY_KIND_ICON_META[kind];
}

/** Icon metadata for any inventory row, including legacy gateway self rows. */
export function getDeviceKindIconMeta(kind: GatewayInventoryKind): InventoryKindIconMeta {
  if (kind === 'gateway') {
    return GATEWAY_META;
  }
  return getInventoryKindIconMeta(kind);
}

export function resolveDeviceKindIcon(
  kind: GatewayInventoryKind,
  options?: { lockOpen?: boolean },
): HeroOutlineIcon {
  if (kind === 'lock' && options?.lockOpen) {
    return LockOpenIcon;
  }
  return getDeviceKindIconMeta(kind).Icon;
}

export const ADD_DEVICE_KIND_OPTIONS = ADDABLE_INVENTORY_KINDS.map((kind) => ({
  kind,
  ...getInventoryKindIconMeta(kind),
}));
