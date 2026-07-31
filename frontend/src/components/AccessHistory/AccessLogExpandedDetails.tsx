import {
  CheckCircleIcon,
  ClockIcon,
  LinkIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { AccessLog } from '@/types/access-history.types';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  buildAccessLogDetailItems,
  formatAccessAction,
  formatAccessMethod,
  getAccessFailureDetail,
  getAccessLogMetadata,
  getAccessStatusDisplay,
  partitionAccessLogDetailItems,
  type AccessLogNavigationTarget,
} from '@/utils/access-history-display.utils';

interface AccessLogExpandedDetailsProps {
  log: AccessLog;
  hideFacility: boolean;
  onNavigate: (
    url: string,
    targetId?: string,
    targetType?: AccessLogNavigationTarget,
  ) => void;
}

export function AccessLogExpandedDetails({
  log,
  hideFacility,
  onNavigate,
}: AccessLogExpandedDetailsProps) {
  const metadata = getAccessLogMetadata(log);
  const statusDisplay = getAccessStatusDisplay(log);
  const failureDetail = getAccessFailureDetail(log);
  const { failure, notes, fields } = partitionAccessLogDetailItems(
    buildAccessLogDetailItems(log, hideFacility, { omitRowSummaryFields: true }),
  );

  const quickLinks = [
    fields.find((item) => item.navigationTarget === 'user'),
    fields.find((item) => item.navigationTarget === 'unit'),
    fields.find((item) => item.navigationTarget === 'device'),
    fields.find((item) => item.navigationTarget === 'facility'),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const quickLinkLabels: Record<string, string> = {
    Unit: 'View unit',
    Device: 'View device',
    'Access point': 'View access point',
    Facility: 'View facility',
  };

  const getQuickLinkLabel = (item: (typeof quickLinks)[number]): string => {
    if (item.navigationTarget === 'user') {
      return item.value;
    }
    return item.value || quickLinkLabels[item.label] || `View ${item.label.toLowerCase()}`;
  };

  const detailFields = fields.filter(
    (item) => !quickLinks.some((link) => link?.label === item.label),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/90">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700/80 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {formatAccessAction(log)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {formatAccessMethod(log)}
            <span className="mx-1.5 text-gray-300 dark:text-gray-600" aria-hidden>
              ·
            </span>
            {formatDateTime(log.occurred_at)}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center self-start rounded-full px-2.5 py-1 text-xs font-medium sm:self-center ${
            statusDisplay.tone === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/25 dark:text-green-400'
              : statusDisplay.tone === 'pending'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/25 dark:text-amber-400'
                : 'bg-red-100 text-red-800 dark:bg-red-900/25 dark:text-red-400'
          }`}
        >
          {statusDisplay.tone === 'success' ? (
            <CheckCircleIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
          ) : statusDisplay.tone === 'pending' ? (
            <ClockIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircleIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
          )}
          {statusDisplay.label}
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        {(failure || failureDetail) && (
          <section
            className="rounded-lg border border-red-200/80 bg-red-50/70 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/20"
            aria-label="Failure reason"
          >
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
              Failure reason
            </h4>
            <p className="mt-1.5 text-sm leading-relaxed text-red-900 dark:text-red-100">
              {failure?.value || failureDetail}
            </p>
          </section>
        )}

        {notes && (
          <section className="rounded-lg border border-gray-200/80 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Notes
            </h4>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
              {notes.value}
            </p>
          </section>
        )}

        {detailFields.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {detailFields.map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {item.label}
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white [overflow-wrap:anywhere]">
                  {item.href ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(item.href!, item.navigationId, item.navigationTarget);
                      }}
                      className="inline-flex max-w-full items-center text-left font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      <span className="truncate">{item.value}</span>
                      <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
                    </button>
                  ) : (
                    item.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {quickLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-700/80">
            {quickLinks.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(item.href!, item.navigationId, item.navigationTarget);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:border-primary-200 hover:bg-primary-50 dark:border-gray-600 dark:bg-gray-800 dark:text-primary-400 dark:hover:border-primary-900/50 dark:hover:bg-primary-950/30"
              >
                {getQuickLinkLabel(item)}
                <LinkIcon className="h-3 w-3 shrink-0" />
              </button>
            ))}
            {metadata.device && !quickLinks.some((item) => item?.navigationTarget === 'device') && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(metadata.device!.navigation_url, metadata.device!.id, 'device');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:border-primary-200 hover:bg-primary-50 dark:border-gray-600 dark:bg-gray-800 dark:text-primary-400 dark:hover:border-primary-900/50 dark:hover:bg-primary-950/30"
              >
                {metadata.device.name || 'View device'}
                <LinkIcon className="h-3 w-3 shrink-0" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
