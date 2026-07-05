import { BoltIcon } from '@heroicons/react/24/outline';
import { FMSWebhookFeedItem } from '@/types/fms.types';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  getWebhookFeedOutcomeClass,
  getWebhookFeedOutcomeLabel,
} from '@/utils/fms-webhook-feed.utils';

interface FMSWebhookFeedProps {
  events: FMSWebhookFeedItem[];
  onReviewPending?: (syncLogId: string) => void;
}

export function FMSWebhookFeed({ events, onReviewPending }: FMSWebhookFeedProps) {
  if (events.length === 0) {
    return (
      <p className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
        Webhook events from your FMS will appear here in real time.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {events.map((event) => (
        <li
          key={event.id}
          className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 shrink-0">
              <BoltIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {event.summaryText}
                </p>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getWebhookFeedOutcomeClass(event)}`}
                >
                  {getWebhookFeedOutcomeLabel(event)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatDateTime(event.receivedAt)}
                {event.changesDetected > 0 && (
                  <span>{` · ${event.changesDetected} change${event.changesDetected !== 1 ? 's' : ''}`}</span>
                )}
              </p>
              {event.requiresReview && event.syncLogId && onReviewPending && (
                <button
                  type="button"
                  onClick={() => onReviewPending(event.syncLogId)}
                  className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Review pending changes
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
