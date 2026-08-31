import type { GatewayInstanceState } from '@protocol/ipc-channels';

import { PanelSection } from './PanelSection';
import { ReconnectIndicator } from './ReconnectIndicator';
import { SessionRoleBadge } from './SessionRoleBadge';
import { resolveGatewayBindingDisplay } from '../utils/gateway-session.utils';

type Props = { gateway: GatewayInstanceState; embedded?: boolean };

export function ConnectionStatus({ gateway, embedded }: Props) {
  const binding = resolveGatewayBindingDisplay(gateway.connectionStatus, gateway.sessionRole);

  return (
    <PanelSection embedded={embedded} className="flex flex-wrap items-start gap-4">
      <div>
        <p className="text-xs uppercase text-gray-500">Cloud status</p>
        <div className="mt-1">
          <SessionRoleBadge
            connectionStatus={gateway.connectionStatus}
            sessionRole={gateway.sessionRole}
            variant="pill"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{binding.description}</p>
        <ReconnectIndicator reconnectAt={gateway.reconnectAt} className="mt-1.5 block text-xs font-medium text-primary-600 dark:text-primary-400" />
      </div>

      <div>
        <p className="text-xs uppercase text-gray-500">Facility</p>
        <p className="font-medium">{gateway.facilityName ?? gateway.facilityId.slice(0, 8)}</p>
      </div>

      <div>
        <p className="text-xs uppercase text-gray-500">Gateway ID</p>
        <p className="font-mono text-xs">{gateway.gatewayId}</p>
      </div>

      {gateway.sessionRole && gateway.connectionStatus === 'connected' && (
        <div>
          <p className="text-xs uppercase text-gray-500">Session role</p>
          <p className="font-mono text-xs">{gateway.sessionRole}</p>
        </div>
      )}

      {gateway.connectedAt && (
        <div>
          <p className="text-xs uppercase text-gray-500">Connected at</p>
          <p className="font-mono text-xs">{new Date(gateway.connectedAt).toLocaleString()}</p>
        </div>
      )}

      {gateway.connectionWarning && (
        <div className="w-full rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">
            {gateway.sessionRole === 'swap_candidate' ? 'Cloud sync blocked' : 'Cloud sync pending'}
          </p>
          <p className="mt-1">{gateway.connectionWarning}</p>
          {gateway.connectionStatus === 'connected' && gateway.sessionRole === 'swap_candidate' && (
            <p className="mt-1 text-xs opacity-80">
              This unit is connected as a swap candidate. Inventory and state sync are rejected until swap recovery completes in the admin UI.
            </p>
          )}
          {gateway.connectionStatus === 'connected' && gateway.sessionRole !== 'swap_candidate' && (
            <p className="mt-1 text-xs opacity-80">
              WebSocket is connected. Retry sync when recovery completes, or bypass recovery in the admin UI.
            </p>
          )}
        </div>
      )}
      {gateway.lastError && gateway.connectionStatus === 'error' && (
        <div className="w-full text-sm text-red-600 dark:text-red-400">{gateway.lastError}</div>
      )}
    </PanelSection>
  );
}
