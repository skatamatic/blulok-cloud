import type { ReactNode } from 'react';
import { SegmentedTabs } from '@/components/Common/SegmentedTabs';

export type ChannelHubPane = 'setup' | 'messages';

const HUB_TABS = [
  { key: 'setup', label: 'Setup' },
  { key: 'messages', label: 'Messages' },
] as const;

interface ChannelHubProps {
  title: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  pane: ChannelHubPane;
  onPaneChange: (pane: ChannelHubPane) => void;
  setup: ReactNode;
  messages: ReactNode;
  offHint: string;
}

/**
 * Per-channel notifications hub: enable toggle + Setup | Messages tabs.
 * Only one pane is shown so provider config and templates never stack.
 */
export function ChannelHub({
  title,
  enabled,
  onEnabledChange,
  pane,
  onPaneChange,
  setup,
  messages,
  offHint,
}: ChannelHubProps) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700/80">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Enable ${title}`}
          onClick={() => onEnabledChange(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
            enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <div className="ml-auto">
          {enabled ? (
            <SegmentedTabs
              size="sm"
              ariaLabel={`${title} sections`}
              tabs={[...HUB_TABS]}
              activeTab={pane}
              onChange={(key) => onPaneChange(key as ChannelHubPane)}
            />
          ) : null}
        </div>
      </header>
      <div className="p-4">
        {enabled ? (pane === 'setup' ? setup : messages) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">{offHint}</p>
        )}
      </div>
    </section>
  );
}
