import { LinkIcon } from '@heroicons/react/24/outline';
import type { NotificationsConfig } from '@/types/notification.types';

interface DeeplinkSectionProps {
  config: NotificationsConfig;
  onChange: (path: string, value: unknown) => void;
}

export function DeeplinkSection({ config, onChange }: DeeplinkSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">App Integration</h2>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Deeplink Base URL</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <LinkIcon className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={config.deeplinkBaseUrl || ''}
            onChange={(e) => onChange('deeplinkBaseUrl', e.target.value)}
            placeholder="blulok://"
            className="w-full pl-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Base URL scheme for mobile deep links (e.g. <code className="text-xs">blulok://</code> or{' '}
          <code className="text-xs">https://app.blulok.com/</code>). Paths like <code className="text-xs">invite</code> and{' '}
          <code className="text-xs">reset-password</code> are appended automatically.
        </p>
      </div>
    </div>
  );
}
