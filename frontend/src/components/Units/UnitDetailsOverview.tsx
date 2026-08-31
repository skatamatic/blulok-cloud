import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilIcon,
  PlusIcon,
  ShieldExclamationIcon,
  SignalIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { UserFilter } from '@/components/Common/UserFilter';
import {
  DetailsOverviewCard,
  DetailsOverviewCardBody,
  OverviewField,
  OverviewSectionHeader,
  OverviewStat,
  overviewAsideClass,
  overviewFieldLabelClass,
  overviewPanelBodyClass,
  overviewPanelSubsectionClass,
  overviewSubsectionDividerClass,
} from '@/components/Common/DetailsPageLayout';
import {
  detailsActionRowClass,
  detailsBtnDangerOutlineSm,
  detailsBtnLinkSm,
  detailsBtnPrimarySm,
  detailsBtnSecondarySm,
  detailsUnlockButtonClass,
  overviewAlertErrorClass,
  overviewAlertErrorTextClass,
  overviewCalloutPrimaryClass,
  overviewEmptyStateClass,
  overviewListItemClass,
  overviewTenantRowClass,
  primaryRoleBadgeClass,
} from '@/components/Common/details-page.styles';
import { statusBadgeSmClass } from '@/utils/statusBadge.utils';
import { AccessGroupMembershipOverview } from '@/components/AccessCodes/AccessGroupMembershipOverview';
import { UnitSharedAccessAddPanel } from '@/components/Units/UnitSharedAccessAddPanel';
import { withReturnPath } from '@/hooks/useBackNavigation';
import { canRequestRemoteUnlock, isLockTransitionPending } from '@/utils/unitLock.utils';
import { formatDate, formatDateTime } from '@/utils/datetime.utils';
import { getUserDisplayName, getUserInitials, shouldShowUserEmail, formatUserContactSubtitle } from '@/utils/userDisplay.utils';
import { PlaceholderUserBadge } from '@/components/UserManagement/PlaceholderUserBadge';
import type { UnitAccessGroupRef } from '@/utils/device-group-membership.utils';
import type { Location } from 'react-router-dom';
import { DeviceConnectivityOverview } from '@/components/Devices/DeviceConnectivityOverview';
import { resolveReachabilityDisplayFields } from '@/utils/device-reachability.utils';

type UnitStatus = 'available' | 'occupied' | 'overlocked' | 'maintenance' | 'reserved';
type LockStatus = 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
type DeviceStatus = 'online' | 'offline' | 'low_battery' | 'error';

export interface UnitDetailsOverviewData {
  id: string;
  unit_number: string;
  unit_type: string;
  status: UnitStatus;
  is_overlocked?: boolean;
  facility_id: string;
  facility_name: string;
  description?: string;
  features?: string[];
  device_status?: DeviceStatus;
  created_at: string;
  updated_at: string;
  reported_device_status?: DeviceStatus;
  status_unreachable_reason?: string | null;
  access_groups?: UnitAccessGroupRef[];
  blulok_device?: {
    id: string;
    device_serial: string;
    firmware_version?: string;
    lock_status: LockStatus;
    device_status: DeviceStatus;
    reported_device_status?: DeviceStatus;
    status_unreachable_reason?: string | null;
    battery_level?: number;
    last_activity?: string;
    last_seen?: string;
    signal_strength?: number;
    temperature?: number;
    error_code?: string | null;
    error_message?: string | null;
  };
  primary_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    is_placeholder?: boolean;
  };
  shared_tenants?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    access_type: 'full' | 'shared' | 'temporary';
    access_granted_at: string;
    access_expires_at?: string;
  }>;
}

export type UnitDetailsTab = 'overview' | 'tenant' | 'device';

interface UnitDetailsOverviewProps {
  activeTab: UnitDetailsTab;
  unit: UnitDetailsOverviewData;
  accessGroups?: UnitAccessGroupRef[];
  location: Location;
  unitId?: string;
  statusColors: Record<UnitStatus, string>;
  lockStatusColors: Record<string, string>;
  canManageUnits: boolean;
  canManageOverlock?: boolean;
  overlockSaving?: boolean;
  onToggleOverlock?: (next: boolean) => void;
  canChangePrimaryTenant: boolean;
  canManageSharedAccess: boolean;
  assigningTenant: boolean;
  removingTenant: string | null;
  showPrimaryTenantChange: boolean;
  showAddSharedAccess: boolean;
  selectedPrimaryTenant: string;
  selectedSharedTenant: string;
  currentUserId?: string;
  isSubmittingUnlock: boolean;
  onAssignPrimary: () => void;
  onRemoveTenant: (tenantId: string) => void;
  onRequestRemovePrimaryTenant?: () => void;
  onRemoteUnlock: () => void;
  onAssignDevice: () => void;
  onChangeDevice: () => void;
  onGoToTenantTab?: () => void;
  onSharedAccessChanged?: () => void;
  setShowPrimaryTenantChange: (value: boolean) => void;
  setShowAddSharedAccess: (value: boolean) => void;
  setSelectedPrimaryTenant: (value: string) => void;
  setSelectedSharedTenant: (value: string) => void;
  onAssignShared: () => Promise<void>;
}

function signalQualityLabel(strength: number) {
  if (strength >= -50) return 'Excellent';
  if (strength >= -60) return 'Good';
  if (strength >= -70) return 'Fair';
  return 'Weak';
}

export function UnitDetailsOverview({
  activeTab,
  unit,
  accessGroups,
  location,
  statusColors,
  lockStatusColors,
  canManageUnits,
  canManageOverlock = false,
  overlockSaving = false,
  onToggleOverlock,
  canChangePrimaryTenant,
  canManageSharedAccess,
  assigningTenant,
  removingTenant,
  showPrimaryTenantChange,
  showAddSharedAccess,
  selectedPrimaryTenant,
  selectedSharedTenant,
  currentUserId,
  isSubmittingUnlock,
  onAssignPrimary,
  onRemoveTenant,
  onRequestRemovePrimaryTenant,
  onRemoteUnlock,
  onAssignDevice,
  onChangeDevice,
  onGoToTenantTab,
  onSharedAccessChanged,
  setShowPrimaryTenantChange,
  setShowAddSharedAccess,
  setSelectedPrimaryTenant,
  setSelectedSharedTenant,
  onAssignShared,
}: UnitDetailsOverviewProps) {
  const sharedSlotsRemaining = unit.shared_tenants ? 4 - unit.shared_tenants.length : 4;
  const resolvedAccessGroups = accessGroups ?? unit.access_groups ?? [];
  const lockStatus = unit.blulok_device?.lock_status ?? 'unknown';
  const reachability = resolveReachabilityDisplayFields({
    effectiveStatus: unit.blulok_device?.device_status ?? unit.device_status,
    reportedDeviceStatus:
      unit.blulok_device?.reported_device_status ?? unit.reported_device_status,
    statusUnreachableReason:
      unit.blulok_device?.status_unreachable_reason ?? unit.status_unreachable_reason,
  });
  const deviceStatus = reachability.effective;
  const reportedDeviceStatus = reachability.reported;
  const statusUnreachableReason = reachability.reason;
  const hasBattery =
    unit.blulok_device?.battery_level != null && !Number.isNaN(Number(unit.blulok_device.battery_level));
  const hasSignal =
    unit.blulok_device?.signal_strength != null && !Number.isNaN(Number(unit.blulok_device.signal_strength));
  const tempNum =
    unit.blulok_device?.temperature != null && !Number.isNaN(Number(unit.blulok_device.temperature))
      ? Number(unit.blulok_device.temperature)
      : null;

  const isOverlocked = Boolean(unit.is_overlocked ?? unit.status === 'overlocked');
  const canShowOverlockToggle =
    canManageOverlock &&
    onToggleOverlock &&
    unit.primary_tenant &&
    (unit.status === 'occupied' || unit.status === 'overlocked');

  const statStrip = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <OverviewStat label="Unit status">
        <div className="flex flex-wrap items-center gap-2">
          <span className={statusBadgeSmClass(statusColors[unit.status])}>
            {unit.status}
          </span>
          {canShowOverlockToggle && (
            <button
              type="button"
              disabled={overlockSaving}
              onClick={() => onToggleOverlock(!isOverlocked)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                isOverlocked
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-750'
              }`}
            >
              <ShieldExclamationIcon
                className={`h-3.5 w-3.5 ${isOverlocked ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}`}
              />
              {overlockSaving ? 'Saving…' : isOverlocked ? 'Overlocked' : 'Mark overlocked'}
            </button>
          )}
        </div>
      </OverviewStat>
      <OverviewStat label="Lock">
        {unit.blulok_device ? (
          <span
            className={statusBadgeSmClass(lockStatusColors[lockStatus] || lockStatusColors.unknown)}
          >
            {lockStatus === 'locked' ? (
              <LockClosedIcon className="mr-1 h-3 w-3" aria-hidden />
            ) : (
              <LockOpenIcon className="mr-1 h-3 w-3" aria-hidden />
            )}
            {lockStatus}
          </span>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400">No device</span>
        )}
      </OverviewStat>
      {unit.blulok_device ? (
        <DeviceConnectivityOverview
          effectiveStatus={deviceStatus}
          reportedStatus={reportedDeviceStatus}
          statusUnreachableReason={statusUnreachableReason}
        />
      ) : (
        <OverviewStat label="Connectivity">
          <span className="text-sm text-gray-500 dark:text-gray-400">—</span>
        </OverviewStat>
      )}
    </div>
  );

  const tenantAside = (
    <aside className={`${overviewAsideClass} self-start`}>
      <p className={overviewFieldLabelClass}>Primary tenant</p>
      {unit.primary_tenant ? (
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">
            {getUserInitials(unit.primary_tenant)}
          </div>
          <div className="min-w-0">
            <Link
              to={`/users/${unit.primary_tenant.id}/details`}
              state={withReturnPath(location)}
              className="block truncate text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              {getUserDisplayName(unit.primary_tenant)}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {unit.primary_tenant.is_placeholder ? <PlaceholderUserBadge /> : null}
              {unit.primary_tenant.is_placeholder ? (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {formatUserContactSubtitle(unit.primary_tenant)}
                </p>
              ) : shouldShowUserEmail(unit.primary_tenant) ? (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{unit.primary_tenant.email}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onGoToTenantTab}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          Assign tenant
        </button>
      )}
    </aside>
  );

  return (
    <>
      {activeTab === 'overview' && (
        <DetailsOverviewCard>
          <DetailsOverviewCardBody>
            {statStrip}

            {(unit.blulok_device?.error_code || unit.blulok_device?.error_message) && (
              <div className={overviewAlertErrorClass}>
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-500" aria-hidden />
                  <div className={overviewAlertErrorTextClass}>
                    {unit.blulok_device?.error_code && (
                      <span className="font-mono font-semibold">{unit.blulok_device.error_code}: </span>
                    )}
                    {unit.blulok_device?.error_message || 'Unknown error'}
                  </div>
                </div>
              </div>
            )}
          </DetailsOverviewCardBody>

          <div
            className={`${overviewPanelBodyClass} border-t border-gray-100 dark:border-gray-700/80 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]`}
          >
              <div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  <OverviewField label="Unit number">{unit.unit_number}</OverviewField>
                  <OverviewField label="Unit type">
                    <span className="capitalize">{unit.unit_type || '—'}</span>
                  </OverviewField>
                  <OverviewField label="Facility">
                    <Link
                      to={`/facilities/${unit.facility_id}`}
                      state={withReturnPath(location)}
                      className="inline-flex items-center font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                    >
                      {unit.facility_name}
                      <ArrowTopRightOnSquareIcon className="ml-1 h-3 w-3" aria-hidden />
                    </Link>
                  </OverviewField>
                  {unit.blulok_device && (
                    <OverviewField label="Device">
                      <Link
                        to={`/devices/${unit.blulok_device.id}`}
                        state={withReturnPath(location)}
                        className="inline-flex items-center font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                      >
                        {unit.blulok_device.device_serial}
                        <ArrowTopRightOnSquareIcon className="ml-1 h-3 w-3" aria-hidden />
                      </Link>
                    </OverviewField>
                  )}
                  <OverviewField label="Created">{formatDate(unit.created_at)}</OverviewField>
                  <OverviewField label="Last updated">{formatDateTime(unit.updated_at)}</OverviewField>
                  {unit.blulok_device?.last_activity && (
                    <OverviewField label="Last access">{formatDateTime(unit.blulok_device.last_activity)}</OverviewField>
                  )}
                  {hasBattery && (
                    <OverviewField label="Battery">
                      <span
                        className={
                          Number(unit.blulok_device!.battery_level) < 20
                            ? 'font-medium text-red-600 dark:text-red-400'
                            : Number(unit.blulok_device!.battery_level) < 50
                              ? 'font-medium text-amber-600 dark:text-amber-400'
                              : 'font-medium text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {unit.blulok_device!.battery_level}%
                      </span>
                    </OverviewField>
                  )}
                </dl>

                {unit.description && (
                  <div className={overviewSubsectionDividerClass}>
                    <p className={overviewFieldLabelClass}>Description</p>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{unit.description}</p>
                  </div>
                )}

                {unit.features && unit.features.length > 0 && (
                  <div className={overviewSubsectionDividerClass}>
                    <p className={`${overviewFieldLabelClass} mb-2`}>Features</p>
                    <div className="flex flex-wrap gap-2">
                      {unit.features.map((feature) => (
                        <span
                          key={feature}
                          className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {tenantAside}
            </div>

            <div className={overviewPanelSubsectionClass}>
              <AccessGroupMembershipOverview
                groups={resolvedAccessGroups}
                facilityId={unit.facility_id}
                location={location}
                hasBoundDevice={Boolean(unit.blulok_device)}
                canManageGroups={canManageUnits}
                noDeviceMessage="Assign a BluLok device to this unit to determine access group membership."
                noGroupsMessage="This unit's lock is not assigned to any access group yet."
              />
            </div>
        </DetailsOverviewCard>
      )}

      {activeTab === 'tenant' && (
        <DetailsOverviewCard>
          <DetailsOverviewCardBody>
          <OverviewSectionHeader
            title="Tenant & sharing"
            description={
              canManageSharedAccess
                ? 'Primary tenant plus up to four shared access holders — add existing users or invite by phone'
                : undefined
            }
            action={
              canChangePrimaryTenant && !showPrimaryTenantChange ? (
                <button
                  type="button"
                  onClick={() => setShowPrimaryTenantChange(true)}
                  className={`${detailsBtnSecondarySm} gap-1.5`}
                >
                  <PencilIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {unit.primary_tenant ? 'Change primary' : 'Assign primary'}
                </button>
              ) : undefined
            }
          />

          {unit.primary_tenant ? (
            <div className={`mt-4 ${overviewTenantRowClass}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white">
                {getUserInitials(unit.primary_tenant)}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/users/${unit.primary_tenant.id}/details`}
                  state={withReturnPath(location)}
                  className="truncate text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
                >
                  {getUserDisplayName(unit.primary_tenant)}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {unit.primary_tenant.is_placeholder ? <PlaceholderUserBadge /> : null}
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {unit.primary_tenant.is_placeholder
                      ? formatUserContactSubtitle(unit.primary_tenant)
                      : shouldShowUserEmail(unit.primary_tenant)
                        ? unit.primary_tenant.email
                        : 'Primary tenant'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={primaryRoleBadgeClass}>
                  Primary
                </span>
                {canChangePrimaryTenant && onRequestRemovePrimaryTenant && (
                  <button
                    type="button"
                    onClick={onRequestRemovePrimaryTenant}
                    disabled={removingTenant === unit.primary_tenant!.id}
                    className={detailsBtnDangerOutlineSm}
                  >
                    {removingTenant === unit.primary_tenant!.id ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      'Remove'
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className={`mt-4 ${overviewEmptyStateClass}`}>
              <UserIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden />
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No primary tenant</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Assign a tenant to activate unit access.</p>
            </div>
          )}

          {canChangePrimaryTenant && showPrimaryTenantChange && (
            <div className={`mt-4 ${overviewCalloutPrimaryClass}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {unit.primary_tenant ? 'Change primary tenant' : 'Assign primary tenant'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Search for a tenant, then apply the change.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPrimaryTenantChange(false);
                    setSelectedPrimaryTenant('');
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <UserFilter
                value={selectedPrimaryTenant}
                onChange={setSelectedPrimaryTenant}
                placeholder="Search for tenant..."
                className="w-full"
                facilityId={unit.facility_id}
                roleFilter="tenant"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPrimaryTenantChange(false);
                    setSelectedPrimaryTenant('');
                  }}
                  className={detailsBtnSecondarySm}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onAssignPrimary}
                  disabled={!selectedPrimaryTenant || assigningTenant}
                  className={detailsBtnPrimarySm}
                >
                  {assigningTenant ? 'Applying…' : 'Apply'}
                </button>
              </div>
            </div>
          )}

          <div className={overviewSubsectionDividerClass}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className={overviewFieldLabelClass}>Shared access</p>
              {canManageSharedAccess && unit.primary_tenant && sharedSlotsRemaining > 0 && !showAddSharedAccess && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSharedTenant('');
                    setShowAddSharedAccess(true);
                  }}
                  className={detailsBtnLinkSm}
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Add shared
                </button>
              )}
            </div>

            {canManageSharedAccess && showAddSharedAccess && unit.primary_tenant && sharedSlotsRemaining > 0 && (
              <UnitSharedAccessAddPanel
                unitId={unit.id}
                facilityId={unit.facility_id}
                currentUserId={currentUserId}
                assigningTenant={assigningTenant}
                selectedSharedTenant={selectedSharedTenant}
                onSelectedSharedTenantChange={setSelectedSharedTenant}
                onAssignExisting={onAssignShared}
                onCancel={() => {
                  setShowAddSharedAccess(false);
                  setSelectedSharedTenant('');
                }}
                onInviteSuccess={() => {
                  setShowAddSharedAccess(false);
                  setSelectedSharedTenant('');
                  onSharedAccessChanged?.();
                }}
              />
            )}

            {unit.shared_tenants && unit.shared_tenants.length > 0 ? (
              <ul className="space-y-2">
                {unit.shared_tenants.map((tenant) => (
                  <li
                    key={tenant.id}
                    className={`${overviewListItemClass} justify-between`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-semibold text-white">
                        {getUserInitials(tenant)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {getUserDisplayName(tenant)}
                        </p>
                        {shouldShowUserEmail(tenant) && (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{tenant.email}</p>
                        )}
                      </div>
                    </div>
                    {canManageSharedAccess && (
                      <button
                        type="button"
                        onClick={() => onRemoveTenant(tenant.id)}
                        disabled={removingTenant === tenant.id}
                        className={detailsBtnDangerOutlineSm}
                      >
                        {removingTenant === tenant.id ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          'Remove'
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {canManageSharedAccess
                  ? 'No shared access holders yet.'
                  : 'Only the primary tenant can access this unit.'}
              </p>
            )}

            {!unit.primary_tenant && canManageSharedAccess && (
              <p className="mt-3 text-xs text-primary-700 dark:text-primary-300">
                Assign a primary tenant before adding shared access.
              </p>
            )}
            {canManageSharedAccess && unit.primary_tenant && sharedSlotsRemaining <= 0 && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                Maximum shared access limit reached (4 tenants).
              </p>
            )}
          </div>
          </DetailsOverviewCardBody>
        </DetailsOverviewCard>
      )}

      {activeTab === 'device' && (
        <DetailsOverviewCard>
          <DetailsOverviewCardBody>
          {unit.blulok_device ? (
            <>
              <OverviewSectionHeader
                title="BluLok device"
                description={unit.blulok_device.device_serial}
                action={
                  <Link
                    to={`/devices/${unit.blulok_device.id}`}
                    state={withReturnPath(location)}
                    className={detailsBtnLinkSm}
                  >
                    Device details
                    <ArrowTopRightOnSquareIcon className="ml-1 h-3 w-3" aria-hidden />
                  </Link>
                }
              />

              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <OverviewField label="Lock">
                  <span className={statusBadgeSmClass(lockStatusColors[lockStatus] || lockStatusColors.unknown)}>
                    {lockStatus}
                  </span>
                </OverviewField>
                <OverviewField label="Connectivity">
                  <DeviceConnectivityOverview
                    variant="inline"
                    effectiveStatus={deviceStatus}
                    reportedStatus={reportedDeviceStatus}
                    statusUnreachableReason={statusUnreachableReason}
                  />
                </OverviewField>
                {hasBattery && (
                  <OverviewField label="Battery">
                    <span
                      className={
                        Number(unit.blulok_device.battery_level) < 20
                          ? 'font-medium text-red-600 dark:text-red-400'
                          : Number(unit.blulok_device.battery_level) < 50
                            ? 'font-medium text-amber-600 dark:text-amber-400'
                            : 'font-medium text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {unit.blulok_device.battery_level}%
                    </span>
                  </OverviewField>
                )}
                {unit.blulok_device.firmware_version && (
                  <OverviewField label="Firmware">{unit.blulok_device.firmware_version}</OverviewField>
                )}
                {hasSignal && (
                  <OverviewField label="Signal strength">
                    <span className="inline-flex items-center gap-1.5">
                      <SignalIcon
                        className={`h-4 w-4 ${
                          Number(unit.blulok_device.signal_strength) >= -50
                            ? 'text-emerald-500'
                            : Number(unit.blulok_device.signal_strength) >= -70
                              ? 'text-amber-500'
                              : 'text-red-500'
                        }`}
                        aria-hidden
                      />
                      {unit.blulok_device.signal_strength} dBm
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      ({signalQualityLabel(Number(unit.blulok_device.signal_strength))})
                    </span>
                  </OverviewField>
                )}
                {tempNum !== null && (
                  <OverviewField label="Temperature">{tempNum.toFixed(1)}°C</OverviewField>
                )}
                {unit.blulok_device.last_seen && (
                  <OverviewField label="Last seen">{formatDateTime(unit.blulok_device.last_seen)}</OverviewField>
                )}
              </dl>

              {(unit.blulok_device.error_code || unit.blulok_device.error_message) && (
                <div className={`${overviewAlertErrorClass} mt-4 px-3 py-2 text-sm`}>
                  {unit.blulok_device.error_code && (
                    <span className="font-mono">{unit.blulok_device.error_code}: </span>
                  )}
                  {unit.blulok_device.error_message || 'Unknown error'}
                </div>
              )}

              {canManageUnits && (
                <div className={detailsActionRowClass}>
                  <button
                    type="button"
                    onClick={onRemoteUnlock}
                    disabled={
                      isSubmittingUnlock ||
                      (!canRequestRemoteUnlock(unit.blulok_device.lock_status) &&
                        !isLockTransitionPending(unit.blulok_device.lock_status))
                    }
                    className={detailsUnlockButtonClass({
                      pending:
                        isLockTransitionPending(unit.blulok_device.lock_status) || isSubmittingUnlock,
                      canUnlock: canRequestRemoteUnlock(unit.blulok_device.lock_status),
                      size: 'sm',
                    })}
                  >
                    {isLockTransitionPending(unit.blulok_device.lock_status) || isSubmittingUnlock
                      ? 'Unlocking…'
                      : canRequestRemoteUnlock(unit.blulok_device.lock_status)
                        ? 'Unlock'
                        : 'Unlocked'}
                  </button>
                  <button
                    type="button"
                    onClick={onChangeDevice}
                    className={`${detailsBtnSecondarySm} gap-1.5`}
                  >
                    <ArrowPathIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Change device
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={overviewEmptyStateClass}>
              <CpuChipIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden />
              <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No lock assigned</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Assign a BluLok device to enable remote access and access group membership.
              </p>
              {canManageUnits && (
                <button
                  type="button"
                  onClick={onAssignDevice}
                  className="btn-primary mt-4"
                >
                  Assign device
                </button>
              )}
            </div>
          )}
          </DetailsOverviewCardBody>
        </DetailsOverviewCard>
      )}
    </>
  );
}
