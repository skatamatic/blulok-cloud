import type { UserInstanceState } from '@protocol/user-simulator-state';
import { EMPTY_APP_REALTIME_STATE } from '@protocol/user-simulator-state';
import {
  appFacilitySelectionHint,
  formatAppFacilityOptionLabel,
  type AppFacilityOption,
} from '../utils/app-facility-options.utils';
import { AppRealtimeEventLog } from './AppRealtimeEventLog';
import { PanelSection } from './PanelSection';

type Props = {
  user: UserInstanceState;
  facilities: AppFacilityOption[];
  facilityId: string;
  onFacilityChange: (facilityId: string) => void;
  facilitiesLoading?: boolean;
  facilitiesError?: string | null;
  busy: boolean;
  /** Stretch the event log to fill the App tab viewport. */
  fillHeight?: boolean;
  onOpenApp: () => void;
  onCloseApp: () => void;
  onClearEvents: () => void;
  onRefreshFacilities?: () => void;
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
  facilitiesLoading = false,
  facilitiesError = null,
  busy,
  fillHeight = false,
  onOpenApp,
  onCloseApp,
  onClearEvents,
  onRefreshFacilities,
}: Props) {
  const appRealtime = user.appRealtime ?? EMPTY_APP_REALTIME_STATE;
  const badge = statusBadge(appRealtime.status);
  const isOpen = appRealtime.status === 'connected' || appRealtime.status === 'connecting';
  const selected = facilities.find((f) => f.id === facilityId);
  const canOpen =
    user.loggedIn &&
    Boolean(facilityId.trim()) &&
    Boolean(selected?.accessible) &&
    !isOpen &&
    !busy;
  const selectionHint = appFacilitySelectionHint(facilities, facilityId);

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
          <label className="min-w-[14rem] flex-1 text-sm">
            <span className="mb-1 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-gray-500">
              <span>Facility</span>
              {onRefreshFacilities && (
                <button
                  type="button"
                  className="normal-case tracking-normal text-[11px] font-medium text-sky-700 hover:underline disabled:opacity-50 dark:text-sky-300"
                  disabled={facilitiesLoading || isOpen || busy || !user.loggedIn}
                  onClick={onRefreshFacilities}
                >
                  {facilitiesLoading ? 'Loading…' : 'Refresh list'}
                </button>
              )}
            </span>
            {facilities.length > 0 ? (
              <select
                className="input"
                value={facilityId}
                disabled={isOpen || busy || facilitiesLoading}
                onChange={(e) => onFacilityChange(e.target.value)}
              >
                {facilities.map((f) => (
                  <option key={f.id} value={f.id} disabled={!f.accessible}>
                    {formatAppFacilityOptionLabel(f)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input font-mono text-xs"
                placeholder={
                  facilitiesLoading
                    ? 'Loading facilities…'
                    : user.loggedIn
                      ? 'No accessible facilities'
                      : 'Facility UUID'
                }
                value={facilityId}
                disabled={isOpen || busy || facilitiesLoading || user.loggedIn}
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
        {facilitiesError && (
          <p className="text-xs text-red-600 dark:text-red-400">{facilitiesError}</p>
        )}
        {selectionHint && !facilitiesError && (
          <p className="text-xs text-amber-700 dark:text-amber-300">{selectionHint}</p>
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
