/**
 * Provider Configuration Form
 *
 * Dynamic form that renders fields based on selected FMS provider
 */

import { useState, useEffect } from 'react';
import { fmsService } from '@/services/fms.service';
import { getProviderMetadata } from '@/config/fms-providers';
import { FMSConfiguration, FMSProviderType, FMSWebhookAuthMode } from '@/types/fms.types';
import { useToast } from '@/contexts/ToastContext';
import { FmsWebhookSecurityFields } from './FmsWebhookSecurityFields';

interface ProviderConfigFormProps {
  facilityId: string;
  providerType: FMSProviderType;
  existingConfig: FMSConfiguration | null;
  onSaved: (config: FMSConfiguration) => void;
}

export function ProviderConfigForm({
  facilityId,
  providerType,
  existingConfig,
  onSaved,
}: ProviderConfigFormProps) {
  const { addToast } = useToast();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);
  const [webhookAuthMode, setWebhookAuthMode] = useState<FMSWebhookAuthMode>(FMSWebhookAuthMode.HMAC);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [hasStoredWebhookSecret, setHasStoredWebhookSecret] = useState(false);
  const [webhookAuthHeader, setWebhookAuthHeader] = useState('Authorization');
  const [webhookSignatureHeader, setWebhookSignatureHeader] = useState('X-Storable-Signature');

  const providerMeta = getProviderMetadata(providerType);

  useEffect(() => {
    if (existingConfig?.config && providerMeta) {
      const config = existingConfig.config;
      const newFormData: Record<string, any> = {};

      if (config.baseUrl) newFormData.baseUrl = config.baseUrl;
      if (config.apiVersion) newFormData.apiVersion = config.apiVersion;

      if (config.auth?.credentials) {
        const creds = config.auth.credentials;
        if (creds.apiKey) newFormData.apiKey = creds.apiKey;
        if (creds.username) newFormData.username = creds.username;
        if (creds.password) newFormData.password = creds.password;
        if (creds.bearerToken) newFormData.bearerToken = creds.bearerToken;
        if (creds.clientId) newFormData.clientId = creds.clientId;
        if (creds.clientSecret) newFormData.clientSecret = creds.clientSecret;
        if (creds.consumerKey) newFormData.consumerKey = creds.consumerKey;
        if (creds.consumerSecret) newFormData.consumerSecret = creds.consumerSecret;
      }

      if (config.customSettings) {
        Object.assign(newFormData, config.customSettings);
      }

      if (config.syncSettings?.autoAcceptChanges !== undefined) {
        setAutoAccept(config.syncSettings.autoAcceptChanges);
      }
      setWebhookAuthMode(config.syncSettings?.webhookAuthMode ?? FMSWebhookAuthMode.HMAC);
      setHasStoredWebhookSecret(Boolean(config.syncSettings?.webhookSecret));
      setWebhookSecret('');
      setWebhookAuthHeader(config.syncSettings?.webhookAuthHeader?.trim() || 'Authorization');
      setWebhookSignatureHeader(
        config.syncSettings?.webhookSignatureHeader?.trim() || 'X-Storable-Signature'
      );

      setFormData(newFormData);
    }
  }, [existingConfig, providerMeta, providerType]);

  if (!providerMeta) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);

      const credentials: Record<string, string> = {};

      providerMeta.configFields.forEach((field) => {
        const value = formData[field.key];
        if (value) {
          if (field.key === 'apiKey') credentials.apiKey = value;
          else if (field.key === 'username') credentials.username = value;
          else if (field.key === 'password') credentials.password = value;
          else if (field.key === 'clientId') credentials.clientId = value;
          else if (field.key === 'clientSecret') credentials.clientSecret = value;
          else if (field.key === 'consumerKey') credentials.consumerKey = value;
          else if (field.key === 'consumerSecret') credentials.consumerSecret = value;
        }
      });

      const resolvedWebhookSecret =
        webhookSecret.trim() ||
        existingConfig?.config?.syncSettings?.webhookSecret ||
        undefined;

      const config = {
        providerType,
        baseUrl: formData.baseUrl,
        apiVersion: formData.apiVersion,
        auth: {
          type: providerMeta.authType,
          credentials,
        },
        features: {
          supportsTenantSync: true,
          supportsUnitSync: true,
          supportsWebhooks: providerMeta.supportsWebhooks,
          supportsRealtime: false,
        },
        syncSettings: {
          autoAcceptChanges: autoAccept,
          webhookAuthMode,
          ...(webhookAuthHeader.trim() ? { webhookAuthHeader: webhookAuthHeader.trim() } : {}),
          ...(webhookSignatureHeader.trim()
            ? { webhookSignatureHeader: webhookSignatureHeader.trim() }
            : {}),
          ...(resolvedWebhookSecret ? { webhookSecret: resolvedWebhookSecret } : {}),
        },
        customSettings:
          providerType === FMSProviderType.SIMULATED
            ? { dataFilePath: formData.dataFilePath || 'config/fms-simulated-data.json' }
            : providerType === FMSProviderType.STOREDGE
              ? { facilityId: formData.facilityId }
              : undefined,
      };

      const savedConfig = existingConfig
        ? await fmsService.updateConfig(existingConfig.id, {
            provider_type: providerType,
            config,
            is_enabled: true,
          })
        : await fmsService.createConfig({
            facility_id: facilityId,
            provider_type: providerType,
            config,
            is_enabled: true,
          });

      onSaved(savedConfig);
      setHasStoredWebhookSecret(Boolean(savedConfig.config?.syncSettings?.webhookSecret));
      setWebhookSecret('');
      addToast({
        type: 'success',
        title: 'Configuration Saved',
        message: `${providerMeta.name} configuration saved successfully`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not save FMS configuration';
      addToast({
        type: 'error',
        title: 'Failed to Save Configuration',
        message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providerMeta.configFields.map((field) => (
          <div key={field.key} className={field.type === 'password' ? 'md:col-span-2' : undefined}>
            <label htmlFor={field.key} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              id={field.key}
              type={field.type}
              value={formData[field.key] || ''}
              onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              required={field.required}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {field.helpText && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.helpText}</p>
            )}
          </div>
        ))}
      </div>

      {providerMeta.supportsWebhooks && (
        <FmsWebhookSecurityFields
          facilityId={facilityId}
          authMode={webhookAuthMode}
          onAuthModeChange={setWebhookAuthMode}
          webhookSecret={webhookSecret}
          onWebhookSecretChange={setWebhookSecret}
          hasStoredWebhookSecret={hasStoredWebhookSecret}
          webhookAuthHeader={webhookAuthHeader}
          onWebhookAuthHeaderChange={setWebhookAuthHeader}
          webhookSignatureHeader={webhookSignatureHeader}
          onWebhookSignatureHeaderChange={setWebhookSignatureHeader}
          autoAccept={autoAccept}
        />
      )}

      <div className="flex items-start gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <input
          type="checkbox"
          id="autoAccept"
          checked={autoAccept}
          onChange={(e) => setAutoAccept(e.target.checked)}
          className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
        />
        <label htmlFor="autoAccept" className="block text-sm text-gray-700 dark:text-gray-300">
          Automatically accept and apply all changes
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Not recommended for production
          </span>
        </label>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : existingConfig ? 'Update Configuration' : 'Save Configuration'}
        </button>
      </div>
    </form>
  );
}
