import type { GatewayInventoryKind } from '@protocol/device-kinds';
import { getDeviceKindIconMeta, resolveDeviceKindIcon } from '../utils/device-icon.utils';
import { devicePresenceStatusLabel, type DevicePresenceStatus } from '../utils/device-inventory.utils';

type Props = {
  kind: GatewayInventoryKind;
  status: DevicePresenceStatus;
  /** BluLok locks use an open padlock when unlocked / OPENED. */
  lockOpen?: boolean;
  /** Card row uses `sm`; add-device menu uses `md`. */
  size?: 'sm' | 'md';
  title?: string;
};

/** Tailwind utilities here (not index.css) so Vite/JIT always emits them. */
const STATUS_CONTAINER_CLASS: Record<Exclude<DevicePresenceStatus, 'online'>, string> = {
  offline: 'bg-gray-100/90 ring-gray-200/80 dark:bg-gray-800/90 dark:ring-gray-700/80',
  error: 'bg-red-600 ring-red-700/40 dark:bg-red-600 dark:ring-red-500/30',
};

const STATUS_ICON_CLASS: Record<Exclude<DevicePresenceStatus, 'online'>, string> = {
  offline: 'text-gray-400 dark:text-gray-500',
  error: 'text-white',
};

export function DeviceKindIcon({ kind, status, lockOpen = false, size = 'sm', title }: Props) {
  const { containerClass, iconClass } = getDeviceKindIconMeta(kind);
  const Icon = resolveDeviceKindIcon(kind, { lockOpen });
  const statusLabel = title ?? devicePresenceStatusLabel(status);

  const containerStatusClass =
    status === 'online' ? containerClass : STATUS_CONTAINER_CLASS[status];
  const iconStatusClass =
    status === 'online' ? iconClass : STATUS_ICON_CLASS[status];

  return (
    <span
      className={[
        'device-kind-icon',
        size === 'sm' ? 'device-kind-icon-sm' : 'device-kind-icon-md',
        containerStatusClass,
      ]
        .filter(Boolean)
        .join(' ')}
      title={statusLabel}
      aria-label={statusLabel}
    >
      <Icon
        className={['device-kind-icon-svg', iconStatusClass].filter(Boolean).join(' ')}
        aria-hidden
      />
    </span>
  );
}