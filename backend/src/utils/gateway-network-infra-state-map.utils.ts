import type { NetworkInfraStateUpdate } from '@/utils/gateway-sync.utils';
import { parseGatewayLastSeen } from '@/utils/gateway-timestamp.utils';

export type NetworkInfraStatePatch = {
  state?: string | null;
  firmwareVersion?: string | null;
  info?: Record<string, unknown>;
  lastSeen?: Date;
  metadata?: Record<string, unknown>;
};

const NETWORK_INFRA_STATE_KNOWN_KEYS = new Set([
  'kind',
  'serial',
  'state',
  'firmware_version',
  'info',
  'last_seen',
]);

export function extractNetworkInfraStateMetadata(
  update: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (!NETWORK_INFRA_STATE_KNOWN_KEYS.has(key)) {
      metadata[key] = value;
    }
  }
  return metadata;
}

export function mapNetworkInfraStateUpdateToPatch(
  update: NetworkInfraStateUpdate,
): NetworkInfraStatePatch {
  const patch: NetworkInfraStatePatch = {};

  if (update.state !== undefined) {
    patch.state = typeof update.state === 'string' ? update.state.trim() : null;
  }
  if (update.firmware_version !== undefined && update.firmware_version !== null) {
    patch.firmwareVersion =
      typeof update.firmware_version === 'string' ? update.firmware_version.trim() : null;
  }
  if (update.info !== undefined && typeof update.info === 'object' && update.info !== null) {
    patch.info = update.info as Record<string, unknown>;
  }

  const lastSeen = parseGatewayLastSeen(update.last_seen);
  if (lastSeen !== undefined) {
    patch.lastSeen = lastSeen;
  }

  const metadata = extractNetworkInfraStateMetadata(update as unknown as Record<string, unknown>);
  if (Object.keys(metadata).length > 0) {
    patch.metadata = metadata;
  }

  return patch;
}

export function isEmptyNetworkInfraStatePatch(patch: NetworkInfraStatePatch): boolean {
  return Object.keys(patch).length === 0;
}

export function formatNetworkInfraStateKey(kind: string, serial: string): string {
  return `${kind}:${serial}`;
}
