import { ArrowPathIcon, SignalIcon, SignalSlashIcon } from '@heroicons/react/24/outline';
import type { GatewayInstanceState } from '@protocol/ipc-channels';

type Props = {
  gateway: GatewayInstanceState;
  connected: boolean;
  connecting: boolean;
  onRefresh: () => void;
};

export function GatewayToolbar({ gateway, connected, connecting, onRefresh }: Props) {
  if (connected || gateway.connectionStatus === 'provisioning') {
    return (
      <div className="gateway-toolbar">
        <div className="gateway-toolbar-actions">
          <button
            type="button"
            className="gateway-toolbar-icon-btn gateway-toolbar-icon-btn-disconnect"
            title={
              gateway.connectionStatus === 'provisioning'
                ? 'Abort provisioning session'
                : 'Disconnect from backend'
            }
            aria-label={
              gateway.connectionStatus === 'provisioning'
                ? 'Abort provisioning session'
                : 'Disconnect from backend'
            }
            onClick={() => void window.simulator.disconnect(gateway.id).then(onRefresh)}
          >
            <SignalSlashIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  const connectLabel =
    connecting
      ? 'Connecting…'
      : gateway.authMode === 'ztp_keypair' && gateway.ztpLifecyclePhase === 'provisioning'
        ? 'Connect (enter provision waiting room)'
        : 'Connect to backend';

  return (
    <div className="gateway-toolbar">
      <div className="gateway-toolbar-actions">
        <button
          type="button"
          className="gateway-toolbar-icon-btn gateway-toolbar-icon-btn-connect"
          disabled={connecting}
          title={connectLabel}
          aria-label={connectLabel}
          onClick={() => void window.simulator.connect(gateway.id).then(onRefresh).catch(onRefresh)}
        >
          {connecting ? (
            <ArrowPathIcon className="gateway-toolbar-icon-btn-spinner h-4 w-4" aria-hidden />
          ) : (
            <SignalIcon className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
