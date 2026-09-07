import { ArrowPathIcon } from '@heroicons/react/24/outline';
import type { ConnectionStatus } from '@protocol/ipc-channels';
import type { GatewaySessionRole } from '@protocol/messages';
import {
  resolveGatewayBindingDisplay,
  sessionBadgeClassName,
  sessionPillClassName,
} from '../utils/gateway-session.utils';

type Props = {
  connectionStatus: ConnectionStatus;
  sessionRole?: GatewaySessionRole;
  compact?: boolean;
  title?: boolean;
  variant?: 'badge' | 'pill';
};

export function SessionRoleBadge({
  connectionStatus,
  sessionRole,
  compact = false,
  title = true,
  variant = 'badge',
}: Props) {
  const binding = resolveGatewayBindingDisplay(connectionStatus, sessionRole);
  const label = compact ? binding.shortLabel : binding.label;
  const tooltip = title ? binding.description : undefined;

  if (variant === 'pill') {
    return (
      <span className={sessionPillClassName(binding.tone)} title={tooltip}>
        {binding.tone === 'swap' && (
          <ArrowPathIcon className="status-pill-swap-icon" aria-hidden />
        )}
        {label}
      </span>
    );
  }

  return (
    <span className={sessionBadgeClassName(binding.tone)} title={tooltip}>
      {label}
    </span>
  );
}
