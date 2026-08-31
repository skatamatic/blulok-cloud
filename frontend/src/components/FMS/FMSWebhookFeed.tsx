import { useState } from 'react';
import { FMSWebhookFeedItem } from '@/types/fms.types';
import { formatWebhookFeedPayload } from '@/utils/fms-webhook-feed.utils';
import { FMSWebhookFeedRow } from './FMSWebhookFeedRow';

interface FMSWebhookFeedProps {
  events: FMSWebhookFeedItem[];
  showPayload?: boolean;
  onReviewPending?: (syncLogId: string) => void;
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
      await navigator.clipboard.writeText(formatWebhookFeedPayload(event));
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
      {events.map((event) => (
        <FMSWebhookFeedRow
          key={event.id}
          event={event}
          expanded={expandedIds.has(event.id)}
          copied={copiedId === event.id}
          showPayload={showPayload}
          onToggle={() => toggleExpanded(event.id)}
          onCopyPayload={() => void copyPayload(event)}
          onReviewPending={onReviewPending}
        />
      ))}
    </ul>
  );
}
