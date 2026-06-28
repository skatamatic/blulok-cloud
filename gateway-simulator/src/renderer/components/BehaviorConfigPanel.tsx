import type { GatewayInstanceState } from '@protocol/ipc-channels';
import { normalizeBehavior } from '@protocol/ipc-channels';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../utils/error-message.utils';
import { PanelSection } from './PanelSection';

const LOCK_UNLOCK_OPTIONS = [
  { value: 'accept', label: 'Accept (apply + state sync)' },
  { value: 'apply-only', label: 'Apply only (local, no sync)' },
  { value: 'ignore', label: 'Ignore (drop command)' },
] as const;

const ACK_OPTIONS = [
  { value: 'accept', label: 'Accept' },
  { value: 'reject', label: 'Reject' },
  { value: 'ignore', label: 'Ignore' },
] as const;

const DELETION_ACK_OPTIONS = [
  { value: 'accept', label: 'Accept' },
  { value: 'reject', label: 'Reject' },
  { value: 'hold', label: 'Hold' },
] as const;

const FIRMWARE_MODE_OPTIONS = [
  { value: 'succeed', label: 'Succeed' },
  { value: 'fail', label: 'Fail' },
  { value: 'stall', label: 'Stall' },
] as const;

type Props = {
  gateway: GatewayInstanceState;
  connected: boolean;
  embedded?: boolean;
  onChange: () => void;
};

export function BehaviorConfigPanel({ gateway, connected, embedded, onChange }: Props) {
  const toast = useToast();
  const b = normalizeBehavior(gateway.behavior);

  const update = async (patch: Partial<typeof b>) => {
    try {
      await window.simulator.setBehavior(gateway.id, patch);
      onChange();
    } catch (err) {
      toast.error('Could not update behavior', errorMessage(err));
    }
  };

  return (
    <PanelSection embedded={embedded} className="space-y-5">
      <div>
        <h3 className="font-semibold">Gateway behavior</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          How this simulator responds to cloud commands and pushes state.
        </p>
      </div>

      <div className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/40">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">State & connectivity</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={b.liveStateSync}
            onChange={(e) => void update({ liveStateSync: e.target.checked })}
          />
          <span>
            <span className="font-medium">Live state sync</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Push state whenever a device field changes
              {!connected && b.liveStateSync ? ' (active once connected)' : ''}.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={b.autoReconnect}
            onChange={(e) => void update({ autoReconnect: e.target.checked })}
          />
          <span>
            <span className="font-medium">Auto-reconnect</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Restores connection after an unexpected drop or on app launch if you were connected. Manual Disconnect
              never auto-reconnects.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={b.respondToPing} onChange={(e) => void update({ respondToPing: e.target.checked })} />
          Respond to PING
        </label>
      </div>

      <div className="space-y-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/40">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Command responses</p>

        <div className="behavior-field">
          <label className="label" htmlFor={`lock-unlock-${gateway.id}`}>
            LOCK / UNLOCK
          </label>
          <select
            id={`lock-unlock-${gateway.id}`}
            className="input select-field"
            value={b.lockUnlockMode}
            onChange={(e) => void update({ lockUnlockMode: e.target.value as typeof b.lockUnlockMode })}
          >
            {LOCK_UNLOCK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Remote lock/unlock from the dashboard sends a signed JWT over the gateway WebSocket.
            {!connected ? ' Connect to receive commands.' : ''}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="behavior-field">
            <label className="label" htmlFor={`access-ack-${gateway.id}`}>
              Access code ACK
            </label>
            <select
              id={`access-ack-${gateway.id}`}
              className="input select-field"
              value={b.accessCodeAckMode}
              onChange={(e) => void update({ accessCodeAckMode: e.target.value as typeof b.accessCodeAckMode })}
            >
              {ACK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="behavior-field">
            <label className="label" htmlFor={`deletion-ack-${gateway.id}`}>
              Device deletion ACK
            </label>
            <select
              id={`deletion-ack-${gateway.id}`}
              className="input select-field"
              value={b.deviceDeletionAckMode}
              onChange={(e) => void update({ deviceDeletionAckMode: e.target.value as typeof b.deviceDeletionAckMode })}
            >
              {DELETION_ACK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="behavior-field">
            <label className="label" htmlFor={`firmware-mode-${gateway.id}`}>
              Firmware mode
            </label>
            <select
              id={`firmware-mode-${gateway.id}`}
              className="input select-field"
              value={b.firmwareMode}
              onChange={(e) => void update({ firmwareMode: e.target.value as typeof b.firmwareMode })}
            >
              {FIRMWARE_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              How OTA push commands complete. Device firmware versions are edited on each device card.
            </p>
          </div>
          <div className="behavior-field">
            <label className="label" htmlFor={`command-latency-${gateway.id}`}>
              Command latency (ms)
            </label>
            <input
              id={`command-latency-${gateway.id}`}
              className="input"
              type="number"
              min={0}
              value={b.commandLatencyMs}
              onChange={(e) => void update({ commandLatencyMs: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
      </div>
    </PanelSection>
  );
}
