import type { GatewayInstanceState } from '@protocol/ipc-channels';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { PanelSection } from './PanelSection';

type Props = {
  gateway: GatewayInstanceState;
  connected: boolean;
  embedded?: boolean;
  onChange: () => void;
};

export function StateControls({ gateway, connected, embedded, onChange }: Props) {
  const toast = useToast();
  const isSwapCandidate = gateway.sessionRole === 'swap_candidate';
  const cloudDisabled = !connected;
  const cloudDisabledReason = !connected ? 'Connect first' : undefined;
  const swapCandidateHint = isSwapCandidate
    ? 'Swap candidates cannot sync until bound via swap recovery — the cloud will reject the request'
    : undefined;

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      onChange();
    } catch (err) {
      toast.error(`${label} failed`, errorMessage(err));
    }
  };

  return (
    <PanelSection embedded={embedded} className={`space-y-4 ${cloudDisabled ? 'opacity-60' : ''}`}>
      <div>
        <h3 className="font-semibold">Cloud sync</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Push inventory and telemetry to the backend over the gateway WebSocket proxy.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={cloudDisabled}
          title={cloudDisabledReason ?? swapCandidateHint}
          onClick={() => void runAction('Inventory sync', () => window.simulator.syncInventory(gateway.id))}
        >
          Sync inventory
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={cloudDisabled}
          title={cloudDisabledReason ?? swapCandidateHint}
          onClick={() => void runAction('State sync', () => window.simulator.syncState(gateway.id))}
        >
          Sync state
        </button>
      </div>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Local profile</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void runAction('Save profile', () => window.simulator.saveProfile(gateway.id))}
          >
            Save profile
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (confirm('Clear all devices?')) {
                void runAction('Clear devices', () => window.simulator.clearDevices(gateway.id));
              }
            }}
          >
            Clear devices
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (confirm('Reset gateway state and behavior defaults?')) {
                void runAction('Reset', () => window.simulator.resetState(gateway.id));
              }
            }}
          >
            Reset all
          </button>
        </div>
      </div>
    </PanelSection>
  );
}
