/**
 * Provider Configuration Form
 * 
 * Dynamic form that renders fields based on selected FMS provider
 */

import { useState } from 'react';
import { fmsService } from '@/services/fms.service';
import { getProviderMetadata } from '@/config/fms-providers';
import { FMSConfiguration, FMSProviderType } from '@/types/fms.types';
import { useToast } from '@/contexts/ToastContext';

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

  const providerMeta = getProviderMetadata(providerType);
  if (!providerMeta) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);

      // Build credentials based on auth type
      const credentials: any = {};
      
      providerMeta.configFields.forEach((field) => {
        const value = formData[field.key];
        if (value) {
          if (field.key === 'apiKey') {
            credentials.apiKey = value;
          } else if (field.key === 'username') {
            credentials.username = value;
          } else if (field.key === 'password') {
            credentials.password = value;
          } else if (field.key === 'clientId') {
            credentials.clientId = value;
          } else if (field.key === 'clientSecret') {
            credentials.clientSecret = value;
          }
        }
      });

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
        },
        customSettings: providerType === FMSProviderType.SIMULATED ? {
          dataFilePath: formData.dataFilePath || 'config/fms-simulated-data.json',
        } : undefined,
      };

      let savedConfig: FMSConfiguration;
      
      if (existingConfig) {
        savedConfig = await fmsService.updateConfig(existingConfig.id, {
          provider_type: providerType,
          config,
          is_enabled: true,
        });
      } else {
        savedConfig = await fmsService.createConfig({
          facility_id: facilityId,
          provider_type: providerType,
          config,
          is_enabled: true,
        });
      }

      onSaved(savedConfig);
      addToast({
        type: 'success',
        title: 'Configuration Saved',
        message: `${providerMeta.name} configuration saved successfully`,
      });
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to Save Configuration',
        message: error.message || 'Could not save FMS configuration',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Dynamic Fields */}
      {providerMeta.configFields.map((field) => (
        <div key={field.key}>
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
          />
          {field.helpText && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {field.helpText}
            </p>
          )}
        </div>
      ))}

      {/* Auto-Accept Toggle */}
      <div className="flex items-center pt-4 border-t border-gray-200 dark:border-gray-700">
        <input
          type="checkbox"
          id="autoAccept"
          checked={autoAccept}
          onChange={(e) => setAutoAccept(e.target.checked)}
          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
        />
        <label htmlFor="autoAccept" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
          Automatically accept and apply all changes (not recommended for production)
        </label>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : existingConfig ? 'Update Configuration' : 'Save Configuration'}
        </button>
      </div>
    </form>
  );
}
