import { Link } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  ShieldExclamationIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import {
  DetailsOverviewCard,
  DetailsOverviewCardBody,
  OverviewField,
  OverviewSectionHeader,
  OverviewStat,
  overviewAsideClass,
  overviewFieldLabelClass,
  overviewPanelBodyClass,
  overviewPanelHeaderClass,
  overviewPanelSubsectionClass,
  overviewStatCardClass,
  overviewSubsectionDividerClass,
} from '@/components/Common/DetailsPageLayout';
import {
  detailsBtnDangerOutlineSm,
  detailsBtnDangerSm,
  overviewAlertErrorClass,
  overviewAlertErrorTextClass,
  overviewAlertWarningClass,
  overviewDangerZoneClass,
} from '@/components/Common/details-page.styles';
import { AccessGroupMembershipOverview } from '@/components/AccessCodes/AccessGroupMembershipOverview';
import { withReturnPath } from '@/hooks/useBackNavigation';
import type { UnitAccessGroupRef } from '@/utils/device-group-membership.utils';
import {
  deviceStatusColors,
  lockStatusColors,
  statusBadgeSmClass,
} from '@/utils/statusBadge.utils';
import { formatAccessDeviceListSubtitle, isGatewaySyncProvisioned } from '@/utils/accessDeviceDisplay.utils';
import {
  formatBluLokDeviceSubtitle,
  getBluLokLockNumber,
} from '@/utils/blulokDeviceDisplay.utils';
import { readDisplayName } from '@/utils/deviceMetadataForm.utils';
import { formatDateTime } from '@/utils/datetime.utils';
import { getUserDisplayName, getUserInitials, shouldShowUserEmail } from '@/utils/userDisplay.utils';
import type { EffectiveAccessCode, AccessMethod } from '@/types/facility.types';
import type { Location } from 'react-router-dom';

type DeviceCategory = 'blulok' | 'access_control';
type LockStatus = 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
type DeviceStatus = 'online' | 'offline' | 'low_battery' | 'error';

export interface DeviceDetailsOverviewData {
  id: string;
  name?: string;
  device_serial: string;
  access_methods?: AccessMethod[];
  relay_channel?: number;
  device_type?: 'gate' | 'elevator' | 'door';
  gateway_id?: string;
  gateway_name?: string | null;
  location_description?: string;
  metadata?: Record<string, unknown>;
  supports_remote_lock?: boolean;
  serial?: string;
  device_settings?: Record<string, unknown>;
  unit_id?: string;
  unit_number?: string;
  facility_id: string;
  facility_name: string;
  lock_status: LockStatus;
  device_status: DeviceStatus;
  battery_level?: number;
  signal_strength?: number;
  temperature?: number;
  error_code?: string | null;
  error_message?: string | null;
  last_activity?: string;
  last_seen?: string;
  firmware_version?: string;
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface DenylistEntryOverview {
  id: string;
  device_id: string;
  user_id: string;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
  source: 'user_deactivation' | 'unit_unassignment' | 'fms_sync' | 'key_sharing_revocation';
  user: {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  };
}

const deviceStatusIcons: Record<DeviceStatus, typeof CheckCircleIcon> = {
  online: CheckCircleIcon,
  offline: ExclamationTriangleIcon,
  low_battery: ExclamationTriangleIcon,
  error: ExclamationTriangleIcon,
};

const sourceLabels: Record<DenylistEntryOverview['source'], string> = {
  user_deactivation: 'User Deactivated',
  unit_unassignment: 'Unit Unassigned',
  fms_sync: 'FMS Sync',
  key_sharing_revocation: 'Key Sharing Revoked',
};

function formatDenylistExpiry(dateString: string | null) {
  if (!dateString) return 'Permanent';
  const date = new Date(dateString);
  const isExpired = date < new Date();
  return (
    <span className={isExpired ? 'text-red-600 dark:text-red-400' : ''}>
      {formatDateTime(dateString)}
      {isExpired && ' (Expired)'}
    </span>
  );
}

function getTimeUntilExpiration(dateString: string | null) {
  if (!dateString) return null;
  const date = new Date(dateString);
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return '< 1 hour';
}

function signalQualityLabel(strength: number) {
  if (strength >= -50) return 'Excellent';
  if (strength >= -60) return 'Good';
  if (strength >= -70) return 'Fair';
  return 'Weak';
}

type DeviceDetailsTab = 'overview' | 'denylist';

interface DeviceDetailsOverviewProps {
  activeTab: DeviceDetailsTab;
  device: DeviceDetailsOverviewData;
  deviceCategory: DeviceCategory;
  location: Location;
  deviceAccessGroups: UnitAccessGroupRef[];
  effectiveAccessCode: EffectiveAccessCode | null;
  denylistEntries: DenylistEntryOverview[];
  loadingDenylist: boolean;
  canManage: boolean;
  isDevAdmin: boolean;
  onUnassignFromUnit: () => void;
  onRemoveFromInventory: () => void;
  onSendDenylistAdd: () => Promise<void>;
  onSendDenylistRemove: () => Promise<void>;
}

export function DeviceDetailsOverview({
  activeTab,
  device,
  deviceCategory,
  location,
  deviceAccessGroups,
  effectiveAccessCode,
  denylistEntries,
  loadingDenylist,
  canManage,
  isDevAdmin,
  onUnassignFromUnit,
  onRemoveFromInventory,
  onSendDenylistAdd,
  onSendDenylistRemove,
}: DeviceDetailsOverviewProps) {
  const blulokLockNumber = deviceCategory === 'blulok' ? getBluLokLockNumber(device) : null;
  const blulokDisplayName = deviceCategory === 'blulok' ? readDisplayName(device.device_settings) : '';

  const tempNum =
    device.temperature !== undefined && device.temperature !== null
      ? typeof device.temperature === 'number'
        ? device.temperature
        : Number(device.temperature)
      : null;

  const accessMethods =
    device.access_methods && device.access_methods.length > 0 ? device.access_methods : (['app'] as AccessMethod[]);

  const lockStatus = device.lock_status ?? 'unknown';
  const deviceStatus = device.device_status ?? 'offline';
  const hasBattery = device.battery_level != null && !Number.isNaN(Number(device.battery_level));
  const hasSignal = device.signal_strength != null && !Number.isNaN(Number(device.signal_strength));
  const hasTemperature = tempNum != null && !Number.isNaN(tempNum);

  const deviceSubtitle =
    deviceCategory === 'blulok'
      ? formatBluLokDeviceSubtitle(device)
      : formatAccessDeviceListSubtitle({
          device_serial: device.device_serial,
          relay_channel: device.relay_channel ?? 1,
          location_description: device.location_description,
        });

  const statStrip = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
      <OverviewStat label="Connectivity">
        <span
          className={statusBadgeSmClass(deviceStatusColors[deviceStatus])}
        >
          {(() => {
            const DeviceStatusIcon = deviceStatusIcons[deviceStatus] || ExclamationTriangleIcon;
            return <DeviceStatusIcon className="mr-1 h-3 w-3" aria-hidden />;
          })()}
          {deviceStatus.replace('_', ' ')}
        </span>
      </OverviewStat>
      <OverviewStat label="Lock">
        <span
          className={statusBadgeSmClass(lockStatusColors[lockStatus])}
        >
          {lockStatus === 'locked' || lockStatus === 'locking' ? (
            <LockClosedIcon className="mr-1 h-3 w-3" aria-hidden />
          ) : lockStatus === 'unlocked' || lockStatus === 'unlocking' ? (
            <LockOpenIcon className="mr-1 h-3 w-3" aria-hidden />
          ) : (
            <ExclamationTriangleIcon className="mr-1 h-3 w-3" aria-hidden />
          )}
          {lockStatus}
        </span>
      </OverviewStat>
    </div>
  );

  const assignmentAside = (
    <aside className={`${overviewAsideClass} self-start`}>
      <p className={overviewFieldLabelClass}>Primary tenant</p>
      {device.primary_tenant ? (
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">
            {getUserInitials(device.primary_tenant)}
          </div>
          <div className="min-w-0">
            <Link
              to={`/users/${device.primary_tenant.id}/details`}
              state={withReturnPath(location)}
              className="block truncate text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              {getUserDisplayName(device.primary_tenant)}
            </Link>
            {shouldShowUserEmail(device.primary_tenant) && (
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">{device.primary_tenant.email}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">None assigned</p>
      )}
    </aside>
  );

  return (
    <>
      {activeTab === 'overview' && (
        <DetailsOverviewCard>
          <DetailsOverviewCardBody>
            {statStrip}

            {(device.error_code || device.error_message) && (
              <div className={overviewAlertErrorClass}>
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-500" aria-hidden />
                  <div className={overviewAlertErrorTextClass}>
                    {device.error_code && (
                      <p className="font-semibold text-red-800 dark:text-red-400">Error: {device.error_code}</p>
                    )}
                    {device.error_message && (
                      <p className={device.error_code ? 'mt-0.5' : ''}>{device.error_message}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DetailsOverviewCardBody>

          <div className={overviewPanelHeaderClass}>
            <OverviewSectionHeader title="Device" description={deviceSubtitle} />
          </div>
        <div className={`${overviewPanelBodyClass} grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]`}>
          <div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {deviceCategory === 'blulok' && (
              <>
                {blulokDisplayName && <OverviewField label="Display name">{blulokDisplayName}</OverviewField>}
                <OverviewField label="Lock number">
                  {blulokLockNumber != null ? `#${blulokLockNumber}` : '—'}
                </OverviewField>
              </>
            )}
            {deviceCategory === 'access_control' && device.name && (
              <OverviewField label="Name">{device.name}</OverviewField>
            )}
            <OverviewField label={deviceCategory === 'access_control' ? 'Hardware serial' : 'Lock serial'}>
              <span className="font-mono text-sm">{device.device_serial}</span>
            </OverviewField>
            {device.firmware_version && <OverviewField label="Firmware">{device.firmware_version}</OverviewField>}
            {deviceCategory === 'access_control' && device.relay_channel != null && (
              <OverviewField label="Relay channel">#{device.relay_channel}</OverviewField>
            )}
            {deviceCategory === 'access_control' && device.device_type && (
              <OverviewField label="Device type">
                <span className="capitalize">{device.device_type}</span>
              </OverviewField>
            )}
            {deviceCategory === 'access_control' && device.location_description && (
              <OverviewField label="Location">{device.location_description}</OverviewField>
            )}
            {deviceCategory === 'access_control' && device.gateway_name && (
              <OverviewField label="Gateway">{device.gateway_name}</OverviewField>
            )}
            {device.serial && <OverviewField label="Gateway serial">{device.serial}</OverviewField>}
            <OverviewField label="Facility">
              <Link
                to={`/facilities/${device.facility_id}`}
                state={withReturnPath(location)}
                className="inline-flex items-center font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {device.facility_name}
                <ArrowTopRightOnSquareIcon className="ml-1 h-3 w-3" aria-hidden />
              </Link>
            </OverviewField>
            {device.unit_id && device.unit_number && (
              <OverviewField label="Unit">
                <div className="space-y-2">
                  <Link
                    to={`/units/${device.unit_id}`}
                    state={withReturnPath(location)}
                    className="inline-flex items-center font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    Unit {device.unit_number}
                    <ArrowTopRightOnSquareIcon className="ml-1 h-3 w-3" aria-hidden />
                  </Link>
                  {deviceCategory === 'blulok' && canManage && (
                    <button
                      type="button"
                      onClick={onUnassignFromUnit}
                      className={detailsBtnDangerOutlineSm}
                    >
                      Unassign from unit
                    </button>
                  )}
                </div>
              </OverviewField>
            )}
            {device.last_activity && (
              <OverviewField label="Last activity">{formatDateTime(device.last_activity)}</OverviewField>
            )}
            {device.last_seen && <OverviewField label="Last seen">{formatDateTime(device.last_seen)}</OverviewField>}
            {hasBattery && (
              <OverviewField label="Battery">
                <span
                  className={
                    Number(device.battery_level) < 20
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : Number(device.battery_level) < 50
                        ? 'font-medium text-amber-600 dark:text-amber-400'
                        : 'font-medium text-emerald-600 dark:text-emerald-400'
                  }
                >
                  {device.battery_level}%
                </span>
              </OverviewField>
            )}
            {hasSignal && (
              <OverviewField label="Signal strength">
                <span className="inline-flex items-center gap-1.5">
                  <SignalIcon
                    className={`h-4 w-4 ${
                      Number(device.signal_strength) >= -50
                        ? 'text-emerald-500'
                        : Number(device.signal_strength) >= -70
                          ? 'text-amber-500'
                          : 'text-red-500'
                    }`}
                    aria-hidden
                  />
                  {device.signal_strength} dBm
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  ({signalQualityLabel(Number(device.signal_strength))})
                </span>
              </OverviewField>
            )}
            {hasTemperature && (
              <OverviewField label="Temperature">
                <span
                  className={
                    tempNum! > 50
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : tempNum! < 5
                        ? 'font-medium text-blue-600 dark:text-blue-400'
                        : ''
                  }
                >
                  {tempNum!.toFixed(1)}°C
                  {tempNum! > 50 && <span className="ml-1 text-xs">⚠ High</span>}
                  {tempNum! < 5 && <span className="ml-1 text-xs">❄ Low</span>}
                </span>
              </OverviewField>
            )}
            {deviceCategory === 'access_control' && (
              <OverviewField label="Provisioning">
                {isGatewaySyncProvisioned(device.metadata) ? 'Gateway inventory sync' : 'Manual (admin)'}
              </OverviewField>
            )}
            </dl>
          </div>

          {assignmentAside}
        </div>

        <div className={overviewPanelSubsectionClass}>
          <AccessGroupMembershipOverview
            groups={deviceAccessGroups}
            facilityId={device.facility_id}
            location={location}
            canManageGroups={canManage}
            description={
              deviceCategory === 'blulok'
                ? 'Group membership for this lock'
                : 'Group membership and credential configuration'
            }
            noGroupsMessage="This device is not currently assigned to a group."
          />

          {deviceCategory === 'access_control' && (
            <>
              <div className={overviewSubsectionDividerClass}>
                <p className={overviewFieldLabelClass}>Effective access code</p>
                {effectiveAccessCode ? (
                  <div className={`mt-3 rounded-lg px-4 py-3 ${overviewStatCardClass}`}>
                    <div className="font-mono text-base tracking-widest text-gray-900 dark:text-white">
                      {effectiveAccessCode.code}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Source: {effectiveAccessCode.source_scope_name} • Valid until{' '}
                      {formatDateTime(effectiveAccessCode.valid_until)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    No effective code assigned to this device.
                  </p>
                )}
              </div>
              <div className={overviewSubsectionDividerClass}>
                <p className={overviewFieldLabelClass}>Access methods</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {accessMethods.map((method) => (
                    <span
                      key={method}
                      className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium capitalize text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    >
                      {method}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {(deviceCategory === 'access_control' || deviceCategory === 'blulok') &&
          device.supports_remote_lock !== true && (
            <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500 dark:border-gray-700/80 dark:text-gray-400">
              Remote control from the cloud is unlock-only for this hardware. Re-lock on site.
            </p>
          )}

      {canManage && (deviceCategory === 'blulok' || deviceCategory === 'access_control') && (
        <div className={`mx-6 mb-6 ${overviewDangerZoneClass}`}>
          <OverviewSectionHeader title="Danger zone" description="Irreversible cloud inventory actions" />
          <p className="mt-3 text-sm text-red-800/90 dark:text-red-100/90">
            Deletes this device&apos;s cloud record for the current gateway, including group memberships
            {deviceCategory === 'blulok' ? ', unit link (if any), and denylist entries' : ''}. Route passes already
            issued expire on schedule. The gateway is notified to stop reporting this device; if offline, the tombstone
            is delivered on reconnect.
            {deviceCategory === 'blulok' && device.unit_id ? (
              <>
                {' '}
                Still assigned to unit{' '}
                <span className="font-medium">{device.unit_number ?? ''}</span> — consider unassigning first.
              </>
            ) : null}{' '}
            To bind the gateway to another facility, use the facility{' '}
            <Link
              to={`/facilities/${device.facility_id}?tab=gateway`}
              state={withReturnPath(location)}
              className="font-medium text-red-900 underline dark:text-red-100"
            >
              Gateway
            </Link>{' '}
            tab.
          </p>
          <button
            type="button"
            onClick={onRemoveFromInventory}
            className={`${detailsBtnDangerSm} mt-4`}
          >
            {deviceCategory === 'blulok'
              ? 'Remove lock from cloud inventory…'
              : 'Remove access device from cloud inventory…'}
          </button>
        </div>
      )}
        </DetailsOverviewCard>
      )}

      {activeTab === 'denylist' && deviceCategory === 'blulok' && (
        <DetailsOverviewCard>
          <DetailsOverviewCardBody>
          <OverviewSectionHeader
            title="Denylist"
            description="Users currently denied access to this device"
            action={
              denylistEntries.length > 0 ? (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  {denylistEntries.length} {denylistEntries.length === 1 ? 'entry' : 'entries'}
                </span>
              ) : undefined
            }
          />

          {isDevAdmin && (
            <div className={`mt-4 ${overviewAlertWarningClass}`}>
              <p className="text-xs font-semibold text-gray-900 dark:text-white">Gateway denylist commands</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Sends signed DENYLIST_ADD / DENYLIST_REMOVE to the facility gateway. Requires an active WebSocket
                session.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onSendDenylistAdd()}
                  className={`${detailsBtnDangerSm} btn-sm`}
                >
                  DENYLIST_ADD
                </button>
                <button
                  type="button"
                  onClick={() => void onSendDenylistRemove()}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  DENYLIST_REMOVE
                </button>
              </div>
            </div>
          )}

          {loadingDenylist ? (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
            </div>
          ) : denylistEntries.length === 0 ? (
            <div className="py-8 text-center">
              <ShieldExclamationIcon className="mx-auto h-9 w-9 text-gray-300 dark:text-gray-600" aria-hidden />
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No denylist entries</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">All users have access to this device</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/60">
                  <tr>
                    {['User', 'Source', 'Expires', 'Remaining', 'Created'].map((col) => (
                      <th
                        key={col}
                        className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800/40">
                  {denylistEntries.map((entry) => {
                    const isExpired = entry.expires_at ? new Date(entry.expires_at) < new Date() : false;
                    return (
                      <tr key={entry.id} className={isExpired ? 'opacity-60' : ''}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {entry.user.first_name && entry.user.last_name
                              ? `${entry.user.first_name} ${entry.user.last_name}`
                              : entry.user.email || entry.user_id}
                          </p>
                          {entry.user.email && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{entry.user.email}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                            {sourceLabels[entry.source] || entry.source}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {formatDenylistExpiry(entry.expires_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {entry.expires_at ? (
                            <span className={isExpired ? 'text-red-600 dark:text-red-400' : ''}>
                              {getTimeUntilExpiration(entry.expires_at)}
                            </span>
                          ) : (
                            'Permanent'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {formatDateTime(entry.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </DetailsOverviewCardBody>
        </DetailsOverviewCard>
      )}
    </>
  );
}
