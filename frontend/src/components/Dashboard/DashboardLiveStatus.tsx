import { SignalIcon } from '@heroicons/react/24/outline';
import { useWebSocket } from '@/contexts/WebSocketContext';

export function DashboardLiveStatus() {
  const { isConnected, isReconnecting } = useWebSocket();

  if (isConnected) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-300"
        title="Dashboard live updates connected"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        Live
      </div>
    );
  }

  if (isReconnecting) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
        title="Reconnecting to live updates"
      >
        <SignalIcon className="h-3.5 w-3.5 animate-pulse" />
        Reconnecting…
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400"
      title="Live updates offline"
    >
      <span className="inline-flex h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
      Offline
    </div>
  );
}
