import { Fragment } from 'react';
import { AccessLog } from '@/types/access-history.types';
import { generateHighlightId } from '@/utils/navigation.utils';
import { AccessLogExpandedDetails } from '@/components/AccessHistory/AccessLogExpandedDetails';
import {
  formatAccessAction,
  formatAccessMethod,
  formatOccupiedUnlockOverrideSubtitle,
  getAccessActionIconTileClass,
  getAccessActionToneClass,
  getAccessLocationDisplay,
  getAccessLogMetadata,
  getAccessLogUserLink,
  getAccessMethodToneClass,
  getAccessStatusDisplay,
  getAccessUserDisplay,
  hasOccupiedUnlockOverride,
} from '@/utils/access-history-display.utils';
import { UNIDENTIFIED_USER_LABEL, UNIDENTIFIED_USER_TITLE } from '@/utils/access-session-display.utils';
import { formatDateTime } from '@/utils/datetime.utils';
import { getAccessHistoryActionIcon, getAccessHistoryMethodIcon } from './accessHistoryIcons';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  BuildingStorefrontIcon,
  CpuChipIcon,
  LinkIcon,
  ChevronUpIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface AccessHistoryTableRowProps {
  log: AccessLog;
  isExpanded: boolean;
  hideFacility: boolean;
  onToggle: (logId: string) => void;
  onNavigate: (url: string, targetId?: string, targetType?: 'user' | 'facility' | 'unit' | 'device') => void;
}

function formatDuration(seconds?: number) {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export function AccessHistoryTableRow({
  log,
  isExpanded,
  hideFacility,
  onToggle,
  onNavigate,
}: AccessHistoryTableRowProps) {
  const ActionIcon = getAccessHistoryActionIcon(log);
  const MethodIcon = getAccessHistoryMethodIcon(log);
  const metadata = getAccessLogMetadata(log);
  const userDisplay = getAccessUserDisplay(log);
  const userLink = getAccessLogUserLink(log);
  const locationDisplay = getAccessLocationDisplay(log, { hideFacility });
  const statusDisplay = getAccessStatusDisplay(log);
  const actionLabel = formatAccessAction(log);
  const actionToneClass = getAccessActionToneClass(log);
  const showsDenialInLabel = /\b(denied|failed)\b/i.test(actionLabel);
  const showOverrideBadge = hasOccupiedUnlockOverride(log);
  const overrideSubtitle = formatOccupiedUnlockOverrideSubtitle(log);

  return (
    <Fragment key={log.id}>
      <tr 
        id={generateHighlightId('access-log', log.id)}
        className={`group cursor-pointer transition-colors duration-200 hover:bg-blue-50/70 dark:hover:bg-blue-900/10 ${
          isExpanded ? 'bg-blue-50/60 dark:bg-blue-900/15' : ''
        } ${
          showOverrideBadge
            ? 'bg-amber-50/70 dark:bg-amber-950/25 hover:bg-amber-50 dark:hover:bg-amber-950/35'
            : ''
        }`}
        onClick={() => onToggle(log.id)}
        aria-expanded={isExpanded}
      >
        <td className="px-4 py-3 align-middle">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getAccessActionIconTileClass(log)}`}
            >
              <ActionIcon className={`h-4 w-4 ${actionToneClass}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <div
                  className={`truncate text-sm font-medium ${actionToneClass}`}
                  title={actionLabel}
                >
                  {actionLabel}
                </div>
                {showOverrideBadge && (
                  <span
                    className="inline-flex shrink-0 items-center rounded-full bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/70 dark:text-amber-200"
                    title="Occupied unit override"
                  >
                    Override
                  </span>
                )}
              </div>
              {overrideSubtitle && (
                <div className="mt-0.5 truncate text-[11px] font-medium text-amber-800 dark:text-amber-300/90">
                  {overrideSubtitle}
                </div>
              )}
              {!log.success && !showsDenialInLabel && (
                <div className="mt-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                  Denied
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 align-middle">
          <div className="flex items-center min-w-0 gap-2">
            <UserIcon
              className={`h-4 w-4 shrink-0 ${
                userDisplay.primary === UNIDENTIFIED_USER_LABEL
                  ? 'text-gray-300 dark:text-gray-600'
                  : 'text-gray-400'
              }`}
            />
            <div className="min-w-0 flex-1">
              {userLink ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(userLink.href, userLink.id, 'user');
                  }}
                  className="block max-w-full truncate text-left text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                  title={userLink.label}
                >
                  <span className="inline-flex max-w-full items-center">
                    <span className="truncate">{userLink.label}</span>
                    <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
                  </span>
                </button>
              ) : (
                <div
                  className={
                    userDisplay.primary === UNIDENTIFIED_USER_LABEL
                      ? 'truncate text-sm text-gray-500 dark:text-gray-400'
                      : 'truncate text-sm font-medium text-gray-900 dark:text-white'
                  }
                  title={
                    userDisplay.primary === UNIDENTIFIED_USER_LABEL
                      ? UNIDENTIFIED_USER_TITLE
                      : userDisplay.primary
                  }
                >
                  {userDisplay.primary}
                </div>
              )}
              {userDisplay.secondary && (
                <div
                  className="truncate text-xs text-gray-500 dark:text-gray-400"
                  title={userDisplay.secondary}
                >
                  {userDisplay.secondary}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 align-middle">
          <div className="flex items-center min-w-0 gap-2">
            {log.device_type === 'blulok' ? (
              <BuildingStorefrontIcon className="h-4 w-4 shrink-0 text-gray-400" />
            ) : (
              <CpuChipIcon className="h-4 w-4 shrink-0 text-gray-400" />
            )}
            <div className="min-w-0 flex-1">
              {!hideFacility && metadata.facility ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(metadata.facility!.navigation_url, metadata.facility!.id, 'facility');
                  }}
                  className="block max-w-full truncate text-left text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                  title={locationDisplay.primary}
                >
                  <span className="inline-flex max-w-full items-center">
                    <span className="truncate">{locationDisplay.primary}</span>
                    <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
                  </span>
                </button>
              ) : (
                <div
                  className="truncate text-sm font-medium text-gray-900 dark:text-white"
                  title={locationDisplay.primary}
                >
                  {metadata.unit ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(metadata.unit!.navigation_url, metadata.unit!.id, 'unit');
                      }}
                      className="inline-flex max-w-full items-center truncate text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                    >
                      <span className="truncate">{locationDisplay.primary}</span>
                      <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
                    </button>
                  ) : metadata.device ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(metadata.device!.navigation_url, metadata.device!.id, 'device');
                      }}
                      className="inline-flex max-w-full items-center truncate text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                    >
                      <span className="truncate">{locationDisplay.primary}</span>
                      <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
                    </button>
                  ) : (
                    locationDisplay.primary
                  )}
                </div>
              )}
              {locationDisplay.secondary && (
                <div
                  className="truncate text-xs text-gray-500 dark:text-gray-400"
                  title={locationDisplay.secondary}
                >
                  {locationDisplay.secondary}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 align-middle">
          <div className="flex min-w-0 items-center gap-1.5">
            <MethodIcon
              className={`h-4 w-4 shrink-0 ${getAccessMethodToneClass(log)}`}
            />
            <span
              className="truncate text-sm text-gray-900 dark:text-white"
              title={formatAccessMethod(log)}
            >
              {formatAccessMethod(log)}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 align-middle whitespace-nowrap">
          <span className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-xs font-medium ${
            statusDisplay.tone === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
              : statusDisplay.tone === 'pending'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400'
                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
          }`}>
            {statusDisplay.tone === 'success' ? (
              <CheckCircleIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            ) : statusDisplay.tone === 'pending' ? (
              <ClockIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircleIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{statusDisplay.label}</span>
          </span>
        </td>
        <td className="px-4 py-3 align-middle whitespace-nowrap">
          <div className="text-sm text-gray-900 dark:text-white">
            {formatDateTime(log.occurred_at)}
          </div>
          {log.duration_seconds ? (
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              Duration: {formatDuration(log.duration_seconds)}
            </div>
          ) : null}
        </td>
        <td className="px-2 py-3 align-middle text-center whitespace-nowrap">
          {isExpanded ? (
            <ChevronUpIcon className="mx-auto h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRightIcon className="mx-auto h-4 w-4 text-gray-400" />
          )}
        </td>
      </tr>
      
      {isExpanded && (
        <tr className="bg-gray-50/50 dark:bg-gray-900/30">
          <td colSpan={7} className="px-4 py-3">
            <AccessLogExpandedDetails
              log={log}
              hideFacility={hideFacility}
              onNavigate={onNavigate}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
