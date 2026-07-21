import type { UserInstanceState } from '@protocol/user-simulator-state';
import { EMPTY_APP_REALTIME_STATE } from '@protocol/user-simulator-state';
import { AppRealtimeEventLog } from './AppRealtimeEventLog';
import { PanelSection } from './PanelSection';

type FacilityOption = { id: string; name: string };

type Props = {
  user: UserInstanceState;
  facilities: FacilityOption[];
  facilityId: string;
  onFacilityChange: (facilityId: string) => void;
  busy: boolean;
  /** Stretch the event log to fill the App tab viewport. */
  fillHeight?: boolean;
  onOpenApp: () => void;
  onCloseApp: () => void;
  onClearEvents: () => void;
};

function statusBadge(status: UserInstanceState['appRealtime']['status']): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'connected':
      return {
        label: 'App open',
        className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
      };
    case 'connecting':
      return {
        label: 'Opening…',
        className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
      };
    case 'error':
      return {
        label: 'Error',
        className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
      };
    default:
      return {
        label: 'App closed',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      };
  }
}

export function AppRealtimeSection({
  user,
  facilities,
  facilityId,
  onFacilityChange,
  busy,
  fillHeight = false,
  onOpenApp,
  onCloseApp,
  onClearEvents,
}: Props) {
  const appRealtime = user.appRealtime ?? EMPTY_APP_REALTIME_STATE;
  const badge = statusBadge(appRealtime.status);
  const isOpen = appRealtime.status === 'connected' || appRealtime.status === 'connecting';
  const canOpen = user.loggedIn && Boolean(facilityId.trim()) && !isOpen && !busy;

  return (
    <div className={fillHeight ? 'flex h-full min-h-0 flex-col gap-4' : 'space-y-4'}>
      <PanelSection embedded className="shrink-0 space-y-4">
        <div>
          <h3 className="device-detail-section-title">Phone app realtime</h3>
          <p className="text-sm text-gray-500">
            Opt-in connection to <span className="font-mono text-xs">/ws/app</span> — simulates the
            user opening the app on their phone. Does not connect automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Facility</span>
            {facilities.length > 0 ? (
              <select
                className="input"
                value={facilityId}
                disabled={isOpen || busy}
                onChange={(e) => onFacilityChange(e.target.value)}
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input font-mono text-xs"
                placeholder="Facility UUID"
                value={facilityId}
                disabled={isOpen || busy}
                onChange={(e) => onFacilityChange(e.target.value)}
              />
            )}
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {!isOpen ? (
              <button type="button" className="btn-primary" disabled={!canOpen} onClick={onOpenApp}>
                {busy ? 'Opening…' : 'Open app'}
              </button>
            ) : (
              <button type="button" className="btn-secondary" disabled={busy} onClick={onCloseApp}>
                Close app
              </button>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {!user.loggedIn && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Refresh the cloud session before opening the app.
          </p>
        )}
        {appRealtime.lastError && (
          <p className="text-xs text-red-600 dark:text-red-400">{appRealtime.lastError}</p>
        )}
        {appRealtime.status === 'connected' && appRealtime.facilityId && (
          <dl className="grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
            <div>
              <dt className="uppercase tracking-wide">Subscribed facility</dt>
              <dd className="font-mono text-gray-700 dark:text-gray-300">{appRealtime.facilityId}</dd>
            </div>
            {appRealtime.subscriptionId && (
              <div>
                <dt className="uppercase tracking-wide">Subscription</dt>
                <dd className="font-mono text-gray-700 dark:text-gray-300 truncate">
                  {appRealtime.subscriptionId}
                </dd>
              </div>
            )}
          </dl>
        )}
      </PanelSection>

      <AppRealtimeEventLog
        events={appRealtime.events}
        onClear={onClearEvents}
        fillHeight={fillHeight}
      />
    </div>
  );
}
