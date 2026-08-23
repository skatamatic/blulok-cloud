import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  MinusCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { FMSWebhookFeedItem } from '@/types/fms.types';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  formatWebhookFeedPayload,
  getWebhookFeedOutcomeClass,
  getWebhookFeedOutcomeLabel,
  webhookFeedHasDetails,
} from '@/utils/fms-webhook-feed.utils';

interface FMSWebhookFeedRowProps {
  event: FMSWebhookFeedItem;
  expanded: boolean;
  copied: boolean;
  showPayload: boolean;
  onToggle: () => void;
  onCopyPayload: () => void;
  onReviewPending?: (syncLogId: string) => void;
}

function outcomeIcon(event: FMSWebhookFeedItem) {
  if (event.status === 'failed') {
    return {
      Icon: XCircleIcon,
      tile: 'bg-rose-50 dark:bg-rose-900/20',
      icon: 'text-rose-600 dark:text-rose-400',
    };
  }
  if (event.status === 'ignored') {
    return {
      Icon: MinusCircleIcon,
      tile: 'bg-gray-100 dark:bg-gray-900/40',
      icon: 'text-gray-500 dark:text-gray-400',
    };
  }
  if (event.requiresReview) {
    return {
      Icon: ClockIcon,
      tile: 'bg-amber-50 dark:bg-amber-900/20',
      icon: 'text-amber-600 dark:text-amber-400',
    };
  }
  return {
    Icon: CheckCircleIcon,
    tile: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
  };
}

export function FMSWebhookFeedRow({
  event,
  expanded,
  copied,
  showPayload,
  onToggle,
  onCopyPayload,
  onReviewPending,
}: FMSWebhookFeedRowProps) {
  const outcome = getWebhookFeedOutcomeLabel(event);
  const expandable = webhookFeedHasDetails(event, showPayload);
  const { Icon, tile, icon } = outcomeIcon(event);

  return (
    <li className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${tile}`}>
          <Icon className={`h-4 w-4 ${icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          {expandable ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="flex w-full items-start gap-2 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-gray-100/80 dark:hover:bg-gray-700/40 transition-colors"
              aria-label={`${event.summaryText}. ${outcome}. ${expanded ? 'Hide details' : 'Show details'}`}
            >
              <WebhookFeedRowSummary event={event} outcome={outcome} />
              <ChevronDownIcon
                className={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          ) : (
            <WebhookFeedRowSummary event={event} outcome={outcome} />
          )}

          {event.requiresReview && event.syncLogId && onReviewPending && (
            <button
              type="button"
              onClick={() => onReviewPending(event.syncLogId)}
              className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              Review pending changes
            </button>
          )}

          {expanded && expandable && (
            <div className="mt-3 space-y-3">
              {event.errorMessage && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                    Error
                  </p>
                  <pre className="mt-1.5 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-3 text-[11px] leading-relaxed text-rose-800 dark:text-rose-200 max-h-40">
                    {event.errorMessage}
                  </pre>
                </div>
              )}
              {showPayload && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Payload
                    </p>
                    <button
                      type="button"
                      onClick={() => void onCopyPayload()}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                      {copied ? 'Copied' : 'Copy JSON'}
                    </button>
                  </div>
                  <pre className="mt-1.5 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-3 text-[11px] leading-relaxed text-gray-800 dark:text-gray-200 max-h-72">
                    {formatWebhookFeedPayload(event)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function WebhookFeedRowSummary({
  event,
  outcome,
}: {
  event: FMSWebhookFeedItem;
  outcome: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{event.summaryText}</p>
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getWebhookFeedOutcomeClass(event)}`}
        >
          {outcome}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {formatDateTime(event.receivedAt)}
        {event.eventType && <span>{` · ${event.eventType}`}</span>}
        {event.changesDetected > 0 && (
          <span>{` · ${event.changesDetected} change${event.changesDetected !== 1 ? 's' : ''}`}</span>
        )}
      </p>
    </div>
  );
}
