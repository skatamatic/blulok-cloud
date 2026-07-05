/**
 * Webhook security settings for FMS provider configuration.
 */

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { getApiBaseUrl } from '@/services/appConfig';
import { FMSWebhookAuthMode } from '@/types/fms.types';

export const WEBHOOK_AUTH_MODE_OPTIONS: Array<{
  value: FMSWebhookAuthMode;
  label: string;
  description: string;
}> = [
  {
    value: FMSWebhookAuthMode.HMAC,
    label: 'HMAC signature (recommended)',
    description: 'Verify HMAC-SHA256 of the raw JSON body (e.g. X-Storable-Signature).',
  },
  {
    value: FMSWebhookAuthMode.HEADER_SECRET,
    label: 'Shared secret in header',
    description: 'Compare a static secret sent in a custom request header (Storable custom headers UI).',
  },
  {
    value: FMSWebhookAuthMode.NONE,
    label: 'No authentication',
    description: 'Accept any POST to the webhook URL. For local testing only.',
  },
];

interface FmsWebhookSecurityFieldsProps {
  facilityId: string;
  authMode: FMSWebhookAuthMode;
  onAuthModeChange: (mode: FMSWebhookAuthMode) => void;
  webhookSecret: string;
  onWebhookSecretChange: (value: string) => void;
  hasStoredWebhookSecret: boolean;
  webhookAuthHeader: string;
  onWebhookAuthHeaderChange: (value: string) => void;
  webhookSignatureHeader: string;
  onWebhookSignatureHeaderChange: (value: string) => void;
  autoAccept: boolean;
}

export function FmsWebhookSecurityFields({
  facilityId,
  authMode,
  onAuthModeChange,
  webhookSecret,
  onWebhookSecretChange,
  hasStoredWebhookSecret,
  webhookAuthHeader,
  onWebhookAuthHeaderChange,
  webhookSignatureHeader,
  onWebhookSignatureHeaderChange,
  autoAccept,
}: FmsWebhookSecurityFieldsProps) {
  const webhookUrl = `${getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '')}/api/v1/fms/webhook/${facilityId}`;

  return (
    <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
      <div>
        <label htmlFor="webhookAuthMode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Webhook security
        </label>
        <select
          id="webhookAuthMode"
          value={authMode}
          onChange={(e) => onAuthModeChange(e.target.value as FMSWebhookAuthMode)}
          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {WEBHOOK_AUTH_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {WEBHOOK_AUTH_MODE_OPTIONS.find((o) => o.value === authMode)?.description}
        </p>
      </div>

      {authMode === FMSWebhookAuthMode.NONE && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs text-red-800 dark:text-red-200"
        >
          <div className="flex gap-2">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">Danger: unauthenticated webhook endpoint</p>
              <p>
                Anyone who knows your facility webhook URL can inject fake FMS events. Use only for
                local/dev testing behind a firewall or tunnel — never in production.
              </p>
              {autoAccept && (
                <p className="font-medium">
                  Auto-accept is enabled: forged webhooks would apply immediately without review.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {authMode === FMSWebhookAuthMode.HMAC && (
        <>
          <div>
            <label htmlFor="webhookSecret" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              HMAC signing secret
            </label>
            <input
              id="webhookSecret"
              type="password"
              value={webhookSecret}
              onChange={(e) => onWebhookSecretChange(e.target.value)}
              placeholder={
                hasStoredWebhookSecret && !webhookSecret
                  ? 'Saved — leave blank to keep current secret'
                  : 'Shared secret for HMAC-SHA256 verification'
              }
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label
              htmlFor="webhookSignatureHeader"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Signature header name
            </label>
            <input
              id="webhookSignatureHeader"
              type="text"
              value={webhookSignatureHeader}
              onChange={(e) => onWebhookSignatureHeaderChange(e.target.value)}
              placeholder="X-Storable-Signature"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Header containing the HMAC hex digest of the raw request body.
            </p>
          </div>
        </>
      )}

      {authMode === FMSWebhookAuthMode.HEADER_SECRET && (
        <>
          <div>
            <label htmlFor="webhookSecretHeader" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Shared secret value
            </label>
            <input
              id="webhookSecretHeader"
              type="password"
              value={webhookSecret}
              onChange={(e) => onWebhookSecretChange(e.target.value)}
              placeholder={
                hasStoredWebhookSecret && !webhookSecret
                  ? 'Saved — leave blank to keep current secret'
                  : 'Long random secret'
              }
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Paste the same value in your FMS provider&apos;s custom webhook headers (plain or{' '}
              <code className="text-[11px]">Bearer &lt;secret&gt;</code>).
            </p>
          </div>
          <div>
            <label htmlFor="webhookAuthHeader" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Auth header name
            </label>
            <input
              id="webhookAuthHeader"
              type="text"
              value={webhookAuthHeader}
              onChange={(e) => onWebhookAuthHeaderChange(e.target.value)}
              placeholder="Authorization"
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </>
      )}

      <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 break-all">
        <span className="font-medium text-gray-700 dark:text-gray-300">Webhook URL: </span>
        {webhookUrl}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Subscribe to: tenant.created, tenant.updated, ledger.moved-in, ledger.moved-out, unit.created,
        unit.deleted, unit.overlock-applied, unit.overlock-removed.
      </p>
    </div>
  );
}
