import { ChevronDownIcon, DevicePhoneMobileIcon, KeyIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { UserDeviceState, UserInstanceState } from '@protocol/user-simulator-state';
import { CachedRoutePassCard } from './CachedRoutePassCard';
import { DeviceField } from './forms/DeviceField';
import {
  getFetchRoutePassDisabledReason,
  isFetchRoutePassDisabled,
} from '../utils/fetch-route-pass.utils';

type FacilityOption = { id: string; name: string };

type Props = {
  user: UserInstanceState;
  device: UserDeviceState;
  expanded: boolean;
  onToggle: () => void;
  facilities: FacilityOption[];
  effectiveFacilityId: string;
  onFacilityChange: (facilityId: string) => void;
  busy: boolean;
  onRegister: () => void;
  onRegenerateKeys: () => void;
  onRemove: () => void;
  onFetchPass: (facilityId: string, facilityName?: string) => void;
  onTamperChange: (facilityId: string, tamper: import('@protocol/user-simulator-state').RoutePassTamperMode) => void;
  onClearPass: (facilityId: string) => void;
};

function DeviceRoutePassSection({
  user,
  device,
  facilities,
  effectiveFacilityId,
  busy,
  onFacilityChange,
  onFetch,
}: {
  user: UserInstanceState;
  device: UserDeviceState;
  facilities: FacilityOption[];
  effectiveFacilityId: string;
  busy: boolean;
  onFacilityChange: (facilityId: string) => void;
  onFetch: (facilityId: string, facilityName?: string) => void;
}) {
  const fetchPassCtx = {
    loggedIn: user.loggedIn,
    deviceRegistered: device.registered,
    facilityId: effectiveFacilityId || undefined,
    busy,
  };
  const fetchPassDisabledReason = getFetchRoutePassDisabledReason(fetchPassCtx);
  const fetchPassDisabled = isFetchRoutePassDisabled(fetchPassCtx);

  return (
    <div className="space-y-2">
      <DeviceField label="Facility for route pass">
        <select
          className="input select-field"
          value={effectiveFacilityId}
          onChange={(e) => onFacilityChange(e.target.value)}
        >
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
          {!facilities.length && <option value="">Add a gateway first</option>}
        </select>
      </DeviceField>
      <button
        type="button"
        className="btn-primary text-sm inline-flex items-center gap-1"
        disabled={fetchPassDisabled}
        title={fetchPassDisabledReason}
        onClick={() => {
          const facName = facilities.find((f) => f.id === effectiveFacilityId)?.name;
          onFetch(effectiveFacilityId, facName);
        }}
      >
        <KeyIcon className="h-4 w-4" />
        Fetch route pass
      </button>
      {fetchPassDisabledReason && (
        <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
          {fetchPassDisabledReason}
        </p>
      )}
    </div>
  );
}

function deviceStatusLabel(device: UserDeviceState): string {
  if (device.linkedFromBackend) return 'Cloud';
  if (device.registered) return 'Registered';
  return 'Local';
}

function deviceStatusTone(device: UserDeviceState): string {
  if (device.linkedFromBackend || device.registered) return 'is-ready';
  return 'is-local';
}

export function UserDeviceCard({
  user,
  device,
  expanded,
  onToggle,
  facilities,
  effectiveFacilityId,
  onFacilityChange,
  busy,
  onRegister,
  onRegenerateKeys,
  onRemove,
  onFetchPass,
  onTamperChange,
  onClearPass,
}: Props) {
  const passCount = device.cachedRoutePasses.length;
  const panelId = `user-device-panel-${device.id}`;

  return (
    <article
      className={`user-device-card ${expanded ? 'user-device-card-expanded' : 'user-device-card-collapsed'}`}
    >
      <button
        type="button"
        className="user-device-card-header"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <DevicePhoneMobileIcon className="user-device-card-icon" aria-hidden />
        <div className="user-device-card-summary min-w-0 flex-1 text-left">
          <p className="user-device-card-title truncate">{device.deviceName}</p>
          <p className="user-device-card-subtitle truncate">{device.appDeviceId}</p>
        </div>
        <span className={`user-device-card-status ${deviceStatusTone(device)}`}>
          {deviceStatusLabel(device)}
        </span>
        {passCount > 0 && (
          <span className="user-device-card-badge">
            {passCount} pass{passCount === 1 ? '' : 'es'}
          </span>
        )}
        <ChevronDownIcon className={`user-device-card-chevron ${expanded ? 'is-open' : ''}`} aria-hidden />
      </button>

      <div
        id={panelId}
        className={`user-device-card-expand ${expanded ? 'is-open' : ''}`}
        aria-hidden={!expanded}
      >
        <div className="user-device-card-expand-inner">
          <div className="user-device-card-body space-y-3">
            <p className="text-xs font-mono text-gray-400 break-all">Pub: {device.publicKeyB64.slice(0, 32)}…</p>
            <div className="flex flex-wrap gap-2">
              {device.hasLocalKeys !== false && !device.registered && (
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={!user.loggedIn || busy}
                  onClick={onRegister}
                >
                  Register key
                </button>
              )}
              <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={onRegenerateKeys}>
                {device.linkedFromBackend ? 'Take over locally' : 'Regenerate keys'}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm text-red-600"
                disabled={busy}
                onClick={onRemove}
              >
                <TrashIcon className="h-4 w-4 inline" />
              </button>
            </div>

            <DeviceRoutePassSection
              user={user}
              device={device}
              facilities={facilities}
              effectiveFacilityId={effectiveFacilityId}
              busy={busy}
              onFacilityChange={onFacilityChange}
              onFetch={onFetchPass}
            />

            {device.cachedRoutePasses.map((pass) => (
              <CachedRoutePassCard
                key={pass.facilityId}
                userId={user.id}
                deviceId={device.id}
                pass={pass}
                onTamperChange={(tamper) => onTamperChange(pass.facilityId, tamper)}
                onClear={() => onClearPass(pass.facilityId)}
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
