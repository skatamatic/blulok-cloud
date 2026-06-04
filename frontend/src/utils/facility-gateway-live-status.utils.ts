export type GatewayOperationalStatus = 'online' | 'offline' | 'error' | 'maintenance';

export type GatewayType = 'physical' | 'http' | 'simulated' | string;

/**
 * Single display rule for facility gateway connectivity across Facility and Gateway tabs.
 * Physical/simulated: inbound /ws/gateway session is live truth.
 * HTTP: gateways row status (outbound polling) remains authoritative.
 */
export function resolveEffectiveGatewayStatus(params: {
  dbStatus: GatewayOperationalStatus | null | undefined;
  wsConnected: boolean;
  gatewayType?: GatewayType | null;
}): GatewayOperationalStatus {
  const { dbStatus, wsConnected, gatewayType } = params;
  const inventoryStatus = dbStatus ?? 'offline';

  if (inventoryStatus === 'maintenance' || inventoryStatus === 'error') {
    return inventoryStatus;
  }

  if (gatewayType === 'http') {
    return inventoryStatus;
  }

  return wsConnected ? 'online' : 'offline';
}

export const gatewayOperationalStatusColors: Record<GatewayOperationalStatus, string> = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
};
