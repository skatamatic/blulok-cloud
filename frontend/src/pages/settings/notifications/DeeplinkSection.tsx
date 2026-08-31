import { LinkIcon } from '@heroicons/react/24/outline';
import type { NotificationsConfig } from '@/types/notification.types';

interface DeeplinkSectionProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function DeeplinkSection({ config, onChange }: DeeplinkSectionProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        App deeplink base
      </label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <LinkIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          value={config.deeplinkBaseUrl || ''}
          onChange={(e) => onChange('deeplinkBaseUrl', e.target.value)}
          placeholder="blulok://"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Shared by invite / reset templates. Paths like <code className="text-xs">invite</code> and{' '}
        <code className="text-xs">reset-password</code> append automatically.
      </p>
    </section>
  );
}
