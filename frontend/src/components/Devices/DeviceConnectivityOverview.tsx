import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { OverviewStat } from '@/components/Common/DetailsPageLayout';
import { statusBadgeSmClass, deviceStatusColors } from '@/utils/statusBadge.utils';
import {
  hasReportedStatusMismatch,
  statusUnreachableReasonLabel,
} from '@/utils/device-reachability.utils';

type DeviceStatus = 'online' | 'offline' | 'low_battery' | 'error';

const deviceStatusIcons: Record<DeviceStatus, typeof CheckCircleIcon> = {
  online: CheckCircleIcon,
  offline: ExclamationTriangleIcon,
  low_battery: ExclamationTriangleIcon,
  error: ExclamationTriangleIcon,
};

function StatusBadge({ status }: { status: DeviceStatus | string }) {
  const key = (status ?? 'offline') as DeviceStatus;
  const Icon = deviceStatusIcons[key] || ExclamationTriangleIcon;
  const colors = deviceStatusColors[key] ?? deviceStatusColors.offline;
  return (
    <span className={statusBadgeSmClass(colors)}>
      <Icon className="mr-1 h-3 w-3" aria-hidden />
      {String(status).replace('_', ' ')}
    </span>
  );
}

export function DeviceConnectivityOverview({
  effectiveStatus,
  reportedStatus,
  statusUnreachableReason,
  variant = 'stat',
}: {
  effectiveStatus: DeviceStatus | string;
  reportedStatus?: DeviceStatus | string | null;
  statusUnreachableReason?: string | null;
  variant?: 'stat' | 'inline';
}) {
  const effective = (effectiveStatus ?? 'offline') as DeviceStatus;
  const reported = (reportedStatus ?? effective) as DeviceStatus;
  const showDual = hasReportedStatusMismatch({
    effective,
    reported,
    reason: statusUnreachableReason,
  });
  const reasonLabel = statusUnreachableReasonLabel(statusUnreachableReason);

  const body = !showDual ? (
    <StatusBadge status={effective} />
  ) : (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Reachability
        </p>
        <StatusBadge status={effective} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Last reported
        </p>
        <StatusBadge status={reported} />
      </div>
      {reasonLabel && (
        <p className="text-xs text-amber-800 dark:text-amber-200/90">{reasonLabel}</p>
      )}
    </div>
  );

  if (variant === 'inline') {
    return body;
  }

  return <OverviewStat label="Connectivity">{body}</OverviewStat>;
}
