import { ReconnectIndicator } from './ReconnectIndicator';

type Props = {
  status: 'disconnected' | 'connecting' | 'provisioning' | 'connected' | 'error';
  reconnectAt?: number;
};

export function DisconnectedBanner({ status, reconnectAt }: Props) {
  if (status === 'connected') return null;

  const showReconnect = reconnectAt != null && status !== 'connecting';

  const message =
    status === 'connecting'
      ? 'Connecting to backend… Cloud sync, access events, and command-driven panels are paused.'
      : showReconnect
        ? 'Connection lost. An automatic reconnect is scheduled (auto-reconnect is enabled in Behavior).'
        : status === 'error'
          ? 'Connection failed. Reconnect to sync inventory, push state, and simulate access events.'
          : 'Disconnected from backend. Connect to sync inventory, push state, and simulate access events.';

  return (
    <div
      className="rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100"
      role="status"
    >
      <p className="font-medium">
        {status === 'connecting' ? 'Establishing connection' : showReconnect ? 'Reconnecting soon' : 'Offline mode'}
      </p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">{message}</p>
      {showReconnect && (
        <p className="mt-2">
          <ReconnectIndicator reconnectAt={reconnectAt} className="font-medium" />
        </p>
      )}
    </div>
  );
}
