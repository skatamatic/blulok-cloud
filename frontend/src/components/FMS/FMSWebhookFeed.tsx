import { useState } from 'react';
import { BoltIcon, ChevronDownIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { FMSWebhookFeedItem } from '@/types/fms.types';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  getWebhookFeedOutcomeClass,
  getWebhookFeedOutcomeLabel,
} from '@/utils/fms-webhook-feed.utils';

interface FMSWebhookFeedProps {
  events: FMSWebhookFeedItem[];
  showPayload?: boolean;
  onReviewPending?: (syncLogId: string) => void;
}

function payloadText(event: FMSWebhookFeedItem): string {
  return JSON.stringify(event.rawPayload ?? event.summary ?? {}, null, 2);
}

export function FMSWebhookFeed({
  events,
  showPayload = false,
  onReviewPending,
}: FMSWebhookFeedProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <p className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
        Webhook events from your FMS will appear here in real time.
      </p>
    );
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyPayload = async (event: FMSWebhookFeedItem) => {
    try {
      await navigator.clipboard.writeText(payloadText(event));
      setCopiedId(event.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === event.id ? null : current));
      }, 1500);
    } catch {
      // Clipboard can be denied in some test / insecure contexts.
    }
  };

  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {events.map((event) => {
        const expanded = expandedIds.has(event.id);
        return (
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
                  {event.eventType && <span>{` · ${event.eventType}`}</span>}
                  {event.changesDetected > 0 && (
                    <span>{` · ${event.changesDetected} change${event.changesDetected !== 1 ? 's' : ''}`}</span>
                  )}
                </p>
                {event.status === 'failed' && event.errorMessage && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    {event.errorMessage}
                  </p>
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
                {showPayload && (
                  <div className="mt-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(event.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        aria-expanded={expanded}
                      >
                        <ChevronDownIcon
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        />
                        {expanded ? 'Hide payload' : 'Show payload'}
                      </button>
                      {expanded && (
                        <button
                          type="button"
                          onClick={() => void copyPayload(event)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                          <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                          {copiedId === event.id ? 'Copied' : 'Copy JSON'}
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <pre className="mt-2 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 p-3 text-[11px] leading-relaxed text-gray-800 dark:text-gray-200 max-h-72">
                        {payloadText(event)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
