import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { getProviderMetadata } from '@/config/fms-providers';
import { FMSConfiguration, FMSProviderType } from '@/types/fms.types';

function enabledBadgeClass(enabled: boolean): string {
  return enabled
    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
}

function formatSyncStatusLabel(status?: string | null): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function syncStatusBadgeClass(status?: string | null): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
    case 'pending_review':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  }
}

function hasConfiguredCredentials(config: FMSConfiguration): boolean {
  if (config.provider_type === FMSProviderType.SIMULATED) {
    return true;
  }

  const creds = config.config?.auth?.credentials;
  if (creds && Object.values(creds).some((value) => typeof value === 'string' && value.length > 0)) {
    return true;
  }

  const meta = getProviderMetadata(config.provider_type);
  const requiredFields = meta?.configFields?.filter((field) => field.required) ?? [];
  if (requiredFields.length === 0) {
    return true;
  }

  const custom = config.config?.customSettings as Record<string, unknown> | undefined;
  return requiredFields.every((field) => {
    if (field.key === 'baseUrl') {
      return Boolean(config.config?.baseUrl?.trim());
    }
    const value = custom?.[field.key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function getExternalFacilityId(config: FMSConfiguration): string | null {
  const custom = config.config?.customSettings as Record<string, unknown> | undefined;
  const id = custom?.facilityId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export interface FMSConfigSummaryProps {
  config: FMSConfiguration;
  providerName: string | null;
  testing: boolean;
  onTestConnection: () => void;
  variant?: 'collapsed' | 'detailed';
}

export function FMSConfigSummary({
  config,
  providerName,
  testing,
  onTestConnection,
  variant = 'detailed',
}: FMSConfigSummaryProps) {
  const meta = getProviderMetadata(config.provider_type);
  const credentialsReady = hasConfiguredCredentials(config);
  const credentialsLabel =
    config.provider_type === FMSProviderType.SIMULATED
      ? 'No credentials needed'
      : credentialsReady
        ? 'Ready'
        : 'Incomplete';

  const testConnectionButton = (
    <button
      type="button"
      onClick={onTestConnection}
      disabled={testing || !credentialsReady}
      title={!credentialsReady ? 'Save credentials before testing' : undefined}
      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
    >
      {testing ? (
        <>
          <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
          Testing…
        </>
      ) : (
        'Test Connection'
      )}
    </button>
  );

  if (variant === 'collapsed') {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 min-w-0 text-sm">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${enabledBadgeClass(config.is_enabled)}`}
          >
            {config.is_enabled ? 'Enabled' : 'Disabled'}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs ${
              credentialsReady
                ? 'text-green-700 dark:text-green-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {credentialsReady ? (
              <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
            )}
            {credentialsLabel}
          </span>
          {config.last_sync_at && (
            <>
              <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 min-w-0">
                <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  Last sync {new Date(config.last_sync_at).toLocaleString()}
                </span>
                {config.last_sync_status && (
                  <span
                    className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${syncStatusBadgeClass(config.last_sync_status)}`}
                  >
                    {formatSyncStatusLabel(config.last_sync_status)}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
        {testConnectionButton}
      </div>
    );
  }

  const baseUrl = config.config?.baseUrl?.trim() || null;
  const externalFacilityId = getExternalFacilityId(config);
  const autoAccept = config.config?.syncSettings?.autoAcceptChanges ?? false;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Provider
          </p>
          <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white">
            {providerName ?? config.provider_type}
          </p>
          {meta?.description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
              {meta.description}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Status
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${enabledBadgeClass(config.is_enabled)}`}
            >
              {config.is_enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                credentialsReady
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {credentialsReady ? (
                <CheckCircleIcon className="h-3.5 w-3.5" />
              ) : (
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              )}
              {credentialsLabel}
            </span>
          </div>
        </div>
      </div>

      {(baseUrl || externalFacilityId || config.last_sync_at) && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30 px-4 py-3 space-y-2 text-sm">
          {baseUrl && (
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">Endpoint: </span>
              <span className="font-mono text-gray-900 dark:text-white break-all">{baseUrl}</span>
            </p>
          )}
          {externalFacilityId && (
            <p className="text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">FMS facility ID: </span>
              <span className="font-mono text-gray-900 dark:text-white">{externalFacilityId}</span>
            </p>
          )}
          {config.last_sync_at && (
            <p className="flex flex-wrap items-center gap-2 text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">Last sync:</span>
              <span>{new Date(config.last_sync_at).toLocaleString()}</span>
              {config.last_sync_status && (
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${syncStatusBadgeClass(config.last_sync_status)}`}
                >
                  {formatSyncStatusLabel(config.last_sync_status)}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {(autoAccept ||
        config.config?.features?.supportsTenantSync !== false ||
        config.config?.features?.supportsUnitSync !== false) && (
        <div className="flex flex-wrap gap-2">
          {config.config?.features?.supportsTenantSync !== false && (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
              Tenant sync
            </span>
          )}
          {config.config?.features?.supportsUnitSync !== false && (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
              Unit sync
            </span>
          )}
          {autoAccept && (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              Auto-accept changes
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configuration managed by administrators.
        </p>
        {testConnectionButton}
      </div>
    </div>
  );
}
