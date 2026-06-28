import type { ConnectionStatus } from '@protocol/ipc-channels';
import type { GatewaySessionRole } from '@protocol/messages';

export type GatewayBindingTone = 'bound' | 'swap' | 'legacy' | 'offline' | 'connecting' | 'error';

export type GatewayBindingDisplay = {
  label: string;
  shortLabel: string;
  tone: GatewayBindingTone;
  description: string;
};

export function resolveGatewayBindingDisplay(
  connectionStatus: ConnectionStatus,
  sessionRole?: GatewaySessionRole,
): GatewayBindingDisplay {
  if (connectionStatus === 'disconnected') {
    return {
      label: 'Offline',
      shortLabel: 'Offline',
      tone: 'offline',
      description: 'Not connected to the cloud backend.',
    };
  }
  if (connectionStatus === 'connecting') {
    return {
      label: 'Connecting…',
      shortLabel: 'Connecting',
      tone: 'connecting',
      description: 'Establishing WebSocket connection and authenticating.',
    };
  }
  if (connectionStatus === 'error') {
    return {
      label: 'Connection error',
      shortLabel: 'Error',
      tone: 'error',
      description: 'The last connection attempt failed. Reconnect to resume cloud sync.',
    };
  }

  switch (sessionRole) {
    case 'active':
      return {
        label: 'Bound (production)',
        shortLabel: 'Bound',
        tone: 'bound',
        description: 'This gateway is bound to the facility as the active production unit.',
      };
    case 'swap_candidate':
      return {
        label: 'Swap candidate',
        shortLabel: 'Swap candidate',
        tone: 'swap',
        description: 'Connected as a swap candidate. Complete swap recovery in the admin UI to bind this hardware.',
      };
    case 'legacy':
      return {
        label: 'Legacy session',
        shortLabel: 'Legacy',
        tone: 'legacy',
        description: 'Connected with a legacy session role.',
      };
    default:
      return {
        label: 'Connected',
        shortLabel: 'Online',
        tone: 'bound',
        description: 'Connected to the cloud backend.',
      };
  }
}

export function sessionBadgeClassName(tone: GatewayBindingTone): string {
  switch (tone) {
    case 'bound':
      return 'session-badge session-badge-bound';
    case 'swap':
      return 'session-badge session-badge-swap';
    case 'legacy':
      return 'session-badge session-badge-legacy';
    case 'offline':
      return 'session-badge session-badge-offline';
    case 'connecting':
      return 'session-badge session-badge-connecting';
    case 'error':
      return 'session-badge session-badge-error';
    default:
      return 'session-badge session-badge-offline';
  }
}

/** Toolbar / panel pills — matches `.live-sync-indicator` styling. */
export function sessionPillClassName(tone: GatewayBindingTone): string {
  switch (tone) {
    case 'bound':
      return 'status-pill status-pill-bound';
    case 'swap':
      return 'status-pill status-pill-swap';
    case 'legacy':
      return 'status-pill status-pill-legacy';
    case 'offline':
      return 'status-pill status-pill-offline';
    case 'connecting':
      return 'status-pill status-pill-connecting';
    case 'error':
      return 'status-pill status-pill-error';
    default:
      return 'status-pill status-pill-offline';
  }
}

/** Sidebar uses a rotating swap icon instead of a dot for swap candidates. */
export function sidebarShowsSwapIcon(
  connectionStatus: ConnectionStatus,
  sessionRole?: GatewaySessionRole,
): boolean {
  return connectionStatus === 'connected' && sessionRole === 'swap_candidate';
}

/** Sidebar list item — dot color encodes binding role when connected (not swap candidate). */
export function sidebarStatusDotClass(
  connectionStatus: ConnectionStatus,
  sessionRole?: GatewaySessionRole,
): string {
  if (connectionStatus === 'disconnected') return 'gateway-sidebar-status-dot-offline';
  if (connectionStatus === 'connecting') return 'gateway-sidebar-status-dot-connecting';
  if (connectionStatus === 'error') return 'gateway-sidebar-status-dot-error';
  if (sessionRole === 'legacy') return 'gateway-sidebar-status-dot-legacy';
  return 'gateway-sidebar-status-dot-bound';
}
