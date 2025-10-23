/**
 * FMS Provider Metadata
 * 
 * Defines configuration fields and metadata for each FMS provider
 */

import { FMSProviderType, FMSAuthType, FMSProviderMetadata } from '@/types/fms.types';

export const FMS_PROVIDERS: Record<FMSProviderType, FMSProviderMetadata> = {
  [FMSProviderType.STOREDGE]: {
    type: FMSProviderType.STOREDGE,
    name: 'Storable Edge',
    description: 'Storable Edge (StorEdge) self-storage management system integration with OAuth 1.0a authentication.',
    authType: FMSAuthType.OAUTH1,
    requiresBaseUrl: true,
    supportsWebhooks: false,
    configFields: [
      {
        key: 'baseUrl',
        label: 'Storable Edge API URL',
        type: 'url',
        required: true,
        placeholder: 'https://api.storedge.com',
        helpText: 'Storable Edge API base URL',
      },
      {
        key: 'facilityId',
        label: 'Facility ID',
        type: 'text',
        required: true,
        placeholder: 'your-facility-id',
        helpText: 'Your Storable Edge facility ID',
      },
      {
        key: 'consumerKey',
        label: 'Consumer Key',
        type: 'text',
        required: true,
        placeholder: 'Enter your OAuth consumer key',
        helpText: 'OAuth 1.0a consumer key provided by Storable Edge',
      },
      {
        key: 'consumerSecret',
        label: 'Consumer Secret',
        type: 'password',
        required: true,
        placeholder: 'Enter your OAuth consumer secret',
        helpText: 'OAuth 1.0a consumer secret provided by Storable Edge',
      },
    ],
  },

  [FMSProviderType.GENERIC_REST]: {
    type: FMSProviderType.GENERIC_REST,
    name: 'Rest Custom',
    description: 'Custom REST API integration for any FMS system.',
    authType: FMSAuthType.API_KEY,
    requiresBaseUrl: true,
    supportsWebhooks: false,
    configFields: [
      {
        key: 'baseUrl',
        label: 'API Base URL',
        type: 'url',
        required: true,
        placeholder: 'https://api.your-fms.com',
        helpText: 'Base URL of the FMS API',
      },
      {
        key: 'apiVersion',
        label: 'API Version',
        type: 'text',
        required: false,
        placeholder: 'v1',
        helpText: 'API version to use (if applicable)',
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'Enter your API key',
        helpText: 'API key for authentication',
      },
    ],
  },

  [FMSProviderType.SIMULATED]: {
    type: FMSProviderType.SIMULATED,
    name: 'Simulated Provider',
    description: 'Test provider that reads from a config file. Perfect for demos and testing.',
    authType: FMSAuthType.API_KEY,
    requiresBaseUrl: false,
    supportsWebhooks: true,
    isDevOnly: true, // Only show if dev tools enabled
    configFields: [
      {
        key: 'dataFilePath',
        label: 'Data File Path',
        type: 'text',
        required: false,
        placeholder: 'config/fms-simulated-data.json',
        helpText: 'Path to JSON file with simulated data (relative to backend)',
      },
    ],
  },
};

/**
 * Get available providers (filtered by dev mode)
 */
export function getAvailableProviders(isDevMode: boolean): FMSProviderMetadata[] {
  return Object.values(FMS_PROVIDERS).filter(
    provider => !provider.isDevOnly || isDevMode
  );
}

/**
 * Get provider metadata
 */
export function getProviderMetadata(providerType: FMSProviderType): FMSProviderMetadata | undefined {
  return FMS_PROVIDERS[providerType];
}
