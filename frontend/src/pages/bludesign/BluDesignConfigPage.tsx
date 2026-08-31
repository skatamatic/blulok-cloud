/**
 * BluDesign Configuration Page
 * 
 * Configure storage settings and link BluLok/BluFMS facilities
 * to 3D facility models.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  Cog6ToothIcon,
  CloudIcon,
  LinkIcon,
  LinkSlashIcon,
  FolderIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TrashIcon,
  ArchiveBoxXMarkIcon,
} from '@heroicons/react/24/outline';
import * as bludesignApi from '@/api/bludesign';
import { motion, AnimatePresence } from 'framer-motion';

// LocalStorage keys used by BluDesign
const BLUDESIGN_STORAGE_KEYS = {
  autoSaveDraft: 'bludesign-autosave-draft',
  panelLayout: 'bludesign-panel-layout-v8',
  customDefaultLayout: 'bludesign-custom-default-layout',
  buildingSkins: 'bludesign-building-skins',
  skinThemes: 'bludesign-custom-skin-themes-v1',
  legacyThemes: 'bludesign-custom-themes',
  customThemesV2: 'bludesign-custom-themes-v2',
  globalSkins: 'bludesign-global-skins-v2',
  categorySkins: 'bludesign-category-skins-v1',
  customSkins: 'bludesign-custom-skins-v1',
  preferences: 'bludesign-preferences',
  thumbnailPrefix: 'bludesign_thumbnail_',
};

// Storage provider types
type StorageProviderType = 'local' | 'gcs' | 'gdrive';

interface StorageConfig {
  type: StorageProviderType;
  // Local storage settings
  localPath?: string;
  // GCS settings
  gcsBucket?: string;
  gcsProject?: string;
  gcsKeyFilePath?: string;
  gcsKeyFileContents?: string;
  gcsPublicBucket?: boolean;
  // Google Drive settings
  gdriveClientId?: string;
  gdriveClientSecret?: string;
  gdriveRootFolderId?: string;
  gdriveAccessToken?: string;
  gdriveRefreshToken?: string;
}

// interface FacilityLinkItem {
//   /** BluLok facility ID */
//   blulokFacilityId: string;
//   /** BluLok facility name */
//   blulokFacilityName: string;
//   /** Linked BluDesign facility ID (null if not linked) */
//   bluDesignFacilityId: string | null;
//   /** Linked BluDesign facility name (null if not linked) */
//   bluDesignFacilityName: string | null;
// }

interface BluDesignFacilityInfo {
  id: string;
  name: string;
  linkedBlulokId: string | null;
  linkedBlulokName: string | null;
}

const BluDesignConfigPage: React.FC = () => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [searchParams, setSearchParams] = useSearchParams();

  // Storage configuration state
  const [storageConfig, setStorageConfig] = useState<StorageConfig>({
    type: 'local',
    localPath: '../.blulok-local-data/bludesign',
  });
  const [isStorageSaving, setIsStorageSaving] = useState(false);
  const [isStorageLoading, setIsStorageLoading] = useState(true);
  const [storageConfigSource, setStorageConfigSource] = useState<'database' | 'env_fallback' | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageSaved, setStorageSaved] = useState(false);
  const [testConnectionSuccess, setTestConnectionSuccess] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [gdriveAuthUrl, setGdriveAuthUrl] = useState<string | null>(null);
  const [gdriveTokenStatus, setGdriveTokenStatus] = useState<'valid' | 'expired' | 'missing' | null>(null);

  // Facility linking state
  const [blulokFacilities, setBlulokFacilities] = useState<{ id: string; name: string }[]>([]);
  const [bluDesignFacilities, setBluDesignFacilities] = useState<BluDesignFacilityInfo[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [linkSaving, setLinkSaving] = useState<string | null>(null); // blulokFacilityId being saved
  const [linkSaved, setLinkSaved] = useState<string | null>(null); // blulokFacilityId that was just saved

  // Active section tab
  const [activeTab, setActiveTab] = useState<'storage' | 'links' | 'cache'>('storage');

  const selectTab = useCallback(
    (tab: 'storage' | 'links' | 'cache') => {
      setActiveTab(tab);
      setSearchParams({ tab }, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'storage' || tab === 'links' || tab === 'cache') {
      setActiveTab(tab);
    }
  }, [searchParams]);
  
  // Cache management state
  const [cacheStats, setCacheStats] = useState<{
    draftSize: number;
    thumbnailCount: number;
    totalSize: string;
  }>({ draftSize: 0, thumbnailCount: 0, totalSize: '0 KB' });
  const [isClearing, setIsClearing] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  // Calculate cache statistics
  const calculateCacheStats = useCallback(() => {
    let totalBytes = 0;
    let thumbnailCount = 0;
    let draftSize = 0;
    
    // Iterate through localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      const value = localStorage.getItem(key);
      if (!value) continue;
      
      const size = new Blob([value]).size;
      
      // Check if it's a BluDesign key
      if (key.startsWith(BLUDESIGN_STORAGE_KEYS.thumbnailPrefix)) {
        thumbnailCount++;
        totalBytes += size;
      } else if (key === BLUDESIGN_STORAGE_KEYS.autoSaveDraft) {
        draftSize = size;
        totalBytes += size;
      } else if (Object.values(BLUDESIGN_STORAGE_KEYS).includes(key)) {
        totalBytes += size;
      }
    }
    
    // Format size
    let totalSize: string;
    if (totalBytes < 1024) {
      totalSize = `${totalBytes} B`;
    } else if (totalBytes < 1024 * 1024) {
      totalSize = `${(totalBytes / 1024).toFixed(1)} KB`;
    } else {
      totalSize = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    
    setCacheStats({ draftSize, thumbnailCount, totalSize });
  }, []);
  
  // Clear specific cache types
  const clearDraft = useCallback(() => {
    localStorage.removeItem(BLUDESIGN_STORAGE_KEYS.autoSaveDraft);
    calculateCacheStats();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  }, [calculateCacheStats]);
  
  const clearThumbnails = useCallback(() => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(BLUDESIGN_STORAGE_KEYS.thumbnailPrefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    calculateCacheStats();
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  }, [calculateCacheStats]);
  
  const clearAllCache = useCallback(async () => {
    setIsClearing(true);
    
    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Clear all BluDesign localStorage keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      if (key.startsWith(BLUDESIGN_STORAGE_KEYS.thumbnailPrefix) ||
          Object.values(BLUDESIGN_STORAGE_KEYS).includes(key)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    calculateCacheStats();
    setIsClearing(false);
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  }, [calculateCacheStats]);

  // Load initial data
  useEffect(() => {
    loadStorageConfig();
    loadFacilityData();
    calculateCacheStats();
  }, [calculateCacheStats]);

  const mapApiConfigToState = (config: bludesignApi.BluDesignStorageConfigResponse): StorageConfig => {
    const { providerType, providerConfig } = config;
    if (providerType === 'local') {
      return {
        type: 'local',
        localPath: (providerConfig.basePath as string) || '../.blulok-local-data/bludesign',
      };
    }
    if (providerType === 'gcs') {
      return {
        type: 'gcs',
        gcsBucket: providerConfig.bucketName as string | undefined,
        gcsProject: providerConfig.projectId as string | undefined,
        gcsKeyFilePath: providerConfig.keyFilePath as string | undefined,
        gcsKeyFileContents: providerConfig.keyFileContents as string | undefined,
        gcsPublicBucket: Boolean(providerConfig.publicBucket),
      };
    }
    return {
      type: 'gdrive',
      gdriveClientId: providerConfig.clientId as string | undefined,
      gdriveClientSecret: providerConfig.clientSecret as string | undefined,
      gdriveRootFolderId: providerConfig.rootFolderId as string | undefined,
      gdriveAccessToken: providerConfig.accessToken as string | undefined,
      gdriveRefreshToken: providerConfig.refreshToken as string | undefined,
    };
  };

  const buildBackendStorageConfig = (): Record<string, unknown> => {
    const backendConfig: Record<string, unknown> = {};

    if (storageConfig.type === 'local') {
      backendConfig.basePath = storageConfig.localPath || '../.blulok-local-data/bludesign';
    } else if (storageConfig.type === 'gcs') {
      backendConfig.bucketName = storageConfig.gcsBucket;
      backendConfig.projectId = storageConfig.gcsProject;
      if (storageConfig.gcsKeyFilePath) {
        backendConfig.keyFilePath = storageConfig.gcsKeyFilePath;
      }
      if (storageConfig.gcsKeyFileContents) {
        backendConfig.keyFileContents = storageConfig.gcsKeyFileContents;
      }
      backendConfig.publicBucket = storageConfig.gcsPublicBucket || false;
    } else if (storageConfig.type === 'gdrive') {
      backendConfig.clientId = storageConfig.gdriveClientId;
      backendConfig.clientSecret = storageConfig.gdriveClientSecret;
      backendConfig.rootFolderId = storageConfig.gdriveRootFolderId;
      if (storageConfig.gdriveAccessToken) {
        backendConfig.accessToken = storageConfig.gdriveAccessToken;
      }
      if (storageConfig.gdriveRefreshToken) {
        backendConfig.refreshToken = storageConfig.gdriveRefreshToken;
      }
    }

    return backendConfig;
  };

  const loadStorageConfig = async () => {
    setIsStorageLoading(true);
    try {
      const data = await bludesignApi.getBluDesignStorageConfig();
      if (data.success && data.config) {
        setStorageConfig(mapApiConfigToState(data.config));
        setStorageConfigSource(data.config.source);
      }
    } catch (error) {
      console.error('Failed to load storage config:', error);
    } finally {
      setIsStorageLoading(false);
    }
  };

  const loadFacilityData = async () => {
    setIsLoadingLinks(true);
    try {
      // Load BluLok facilities (real facilities from the main system)
      const blulok = await bludesignApi.getBluLokFacilities();
      setBlulokFacilities(blulok.map(f => ({ id: f.id, name: f.name })));
      
      // Load BluDesign facilities with their link info
      const bludesign = await bludesignApi.getBluDesignFacilitiesWithLinks();
      setBluDesignFacilities(bludesign);
    } catch (error) {
      console.error('Failed to load facility data:', error);
    } finally {
      setIsLoadingLinks(false);
    }
  };

  const handleStorageTypeChange = (type: StorageProviderType) => {
    setStorageConfig({ ...storageConfig, type });
    setStorageError(null);
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setStorageError(null);
    setTestConnectionSuccess(false);

    try {
      const result = await bludesignApi.testStorageProvider(
        storageConfig.type,
        buildBackendStorageConfig(),
      );

      if (result.success) {
        setTestConnectionSuccess(true);
        setTimeout(() => setTestConnectionSuccess(false), 3000);
      } else {
        setStorageError(result.message || 'Connection test failed');
      }
    } catch (error: any) {
      setStorageError(error.response?.data?.message || error.message || 'Failed to test connection');
      console.error('Failed to test storage connection:', error);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveStorage = async () => {
    setIsStorageSaving(true);
    setStorageError(null);
    setStorageSaved(false);

    try {
      const result = await bludesignApi.saveBluDesignStorageConfig(
        storageConfig.type,
        buildBackendStorageConfig(),
      );

      if (result.success) {
        setStorageSaved(true);
        setStorageConfigSource('database');
        await loadStorageConfig();
        setTimeout(() => setStorageSaved(false), 3000);
      } else {
        setStorageError(result.message || 'Failed to save storage configuration');
      }
    } catch (error: any) {
      setStorageError(error.response?.data?.message || error.message || 'Failed to save storage configuration.');
      console.error('Failed to save storage config:', error);
    } finally {
      setIsStorageSaving(false);
    }
  };

  /**
   * Handle linking a BluDesign facility to a BluLok facility
   * @param bluDesignFacilityId The BluDesign facility ID to link
   * @param blulokFacilityId The BluLok facility ID to link to (null to unlink)
   */
  const handleLinkFacility = async (bluDesignFacilityId: string, blulokFacilityId: string | null) => {
    setLinkSaving(bluDesignFacilityId);
    try {
      const blulokFacility = blulokFacilityId
        ? blulokFacilities.find((f) => f.id === blulokFacilityId)
        : null;

      if (blulokFacilityId) {
        await bludesignApi.linkBluDesignToBluLok(
          bluDesignFacilityId,
          blulokFacilityId,
          blulokFacility?.name || 'Unknown'
        );
      } else {
        await bludesignApi.unlinkBluDesign(bluDesignFacilityId);
      }

      setBluDesignFacilities((facilities) =>
        facilities.map((f) => {
          if (f.id === bluDesignFacilityId) {
            return {
              ...f,
              linkedBlulokId: blulokFacilityId,
              linkedBlulokName: blulokFacilityId ? blulokFacility?.name ?? null : null,
            };
          }
          if (blulokFacilityId && f.linkedBlulokId === blulokFacilityId && f.id !== bluDesignFacilityId) {
            return { ...f, linkedBlulokId: null, linkedBlulokName: null };
          }
          return f;
        })
      );
      
      // Show success
      setLinkSaved(bluDesignFacilityId);
      setTimeout(() => setLinkSaved(null), 2000);
    } catch (error) {
      console.error('Failed to update facility link:', error);
    } finally {
      setLinkSaving(null);
    }
  };

  const inputClass = `
    w-full px-3 py-2 rounded-lg border text-sm
    transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500
    ${isDark 
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' 
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
    }
  `;

  const labelClass = `block text-sm font-medium mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;

  const linkSelectClass = (isSaving: boolean) => `
    px-3 py-2 rounded-lg border text-sm min-w-[200px]
    ${isSaving ? 'opacity-50' : ''}
    ${isDark
      ? 'bg-gray-700 border-gray-600 text-white'
      : 'bg-white border-gray-300 text-gray-900'
    }
  `;

  const clearLinkButtonClass = (isSaving: boolean) => `
    flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors
    ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}
    ${isDark
      ? 'border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white'
      : 'border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }
  `;

  return (
    <div className={`min-h-full p-6 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white shadow'}`}>
            <Cog6ToothIcon className="w-6 h-6 text-primary-500" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              BluDesign Configuration
            </h1>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Configure storage and link facilities to 3D models
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`
          flex gap-1 p-1 rounded-lg mb-6
          ${isDark ? 'bg-gray-800' : 'bg-gray-200'}
        `}>
          <button
            onClick={() => selectTab('storage')}
            className={`
              flex items-center gap-2 flex-1 px-4 py-2 rounded-md text-sm font-medium
              transition-all duration-150
              ${activeTab === 'storage'
                ? isDark 
                  ? 'bg-gray-700 text-white' 
                  : 'bg-white text-gray-900 shadow'
                : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <CloudIcon className="w-4 h-4" />
            Storage Configuration
          </button>
          <button
            onClick={() => selectTab('links')}
            className={`
              flex items-center gap-2 flex-1 px-4 py-2 rounded-md text-sm font-medium
              transition-all duration-150
              ${activeTab === 'links'
                ? isDark 
                  ? 'bg-gray-700 text-white' 
                  : 'bg-white text-gray-900 shadow'
                : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <LinkIcon className="w-4 h-4" />
            Facility Linking
          </button>
          <button
            onClick={() => { selectTab('cache'); calculateCacheStats(); }}
            className={`
              flex items-center gap-2 flex-1 px-4 py-2 rounded-md text-sm font-medium
              transition-all duration-150
              ${activeTab === 'cache'
                ? isDark 
                  ? 'bg-gray-700 text-white' 
                  : 'bg-white text-gray-900 shadow'
                : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }
            `}
          >
            <ArchiveBoxXMarkIcon className="w-4 h-4" />
            Cache
          </button>
        </div>

        {/* Storage Configuration Section */}
        <AnimatePresence mode="wait">
          {activeTab === 'storage' && (
            <motion.div
              key="storage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`
                rounded-xl p-6 border
                ${isDark 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200 shadow-sm'
                }
              `}
            >
              <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Storage Provider
              </h2>
              {storageConfigSource && (
                <p className={`text-xs mb-4 ${storageConfigSource === 'database' ? 'text-green-500' : 'text-yellow-500'}`}>
                  {storageConfigSource === 'database'
                    ? 'Using saved configuration from database'
                    : 'Using environment fallback (not yet saved)'}
                </p>
              )}

              {isStorageLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
                </div>
              ) : (
              <>
              
              <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Choose where BluDesign facility data will be stored. If no online storage is 
                configured, data will be saved to the local filesystem.
              </p>

              {/* Storage Type Selection */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {[
                  { type: 'local' as const, label: 'Local', icon: FolderIcon },
                  { type: 'gcs' as const, label: 'Google Cloud Storage', icon: CloudIcon },
                  { type: 'gdrive' as const, label: 'Google Drive', icon: CloudIcon },
                ].map((provider) => (
                  <button
                    key={provider.type}
                    onClick={() => handleStorageTypeChange(provider.type)}
                    className={`
                      flex flex-col items-center gap-2 p-4 rounded-lg border-2
                      transition-all duration-150
                      ${storageConfig.type === provider.type
                        ? 'border-primary-500 bg-primary-500/10'
                        : isDark
                          ? 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                          : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                      }
                    `}
                  >
                    <provider.icon className={`w-6 h-6 ${
                      storageConfig.type === provider.type
                        ? 'text-primary-500'
                        : isDark ? 'text-gray-400' : 'text-gray-500'
                    }`} />
                    <span className={`text-sm font-medium ${
                      storageConfig.type === provider.type
                        ? 'text-primary-500'
                        : isDark ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {provider.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Provider-specific settings */}
              <div className="space-y-4">
                {storageConfig.type === 'local' && (
                  <div>
                    <label className={labelClass}>Local Storage Path</label>
                    <input
                      type="text"
                      value={storageConfig.localPath || ''}
                      onChange={(e) => setStorageConfig({ ...storageConfig, localPath: e.target.value })}
                      placeholder="../.blulok-local-data/bludesign"
                      className={inputClass}
                    />
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Relative to the application root directory
                    </p>
                  </div>
                )}

                {storageConfig.type === 'gcs' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          Project ID <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={storageConfig.gcsProject || ''}
                          onChange={(e) => setStorageConfig({ ...storageConfig, gcsProject: e.target.value })}
                          placeholder="my-gcp-project"
                          className={inputClass}
                          required
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          Your Google Cloud Platform project ID
                        </p>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Bucket Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={storageConfig.gcsBucket || ''}
                          onChange={(e) => setStorageConfig({ ...storageConfig, gcsBucket: e.target.value })}
                          placeholder="blulok-assets"
                          className={inputClass}
                          required
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          GCS bucket name (must exist)
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Service Account Key File Path (Optional)</label>
                      <input
                        type="text"
                        value={storageConfig.gcsKeyFilePath || ''}
                        onChange={(e) => setStorageConfig({ ...storageConfig, gcsKeyFilePath: e.target.value })}
                        placeholder="/path/to/service-account-key.json"
                        className={inputClass}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Path to service account JSON key file. Leave empty to use default credentials or key file contents.
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>Service Account Key File Contents (Optional)</label>
                      <textarea
                        value={storageConfig.gcsKeyFileContents || ''}
                        onChange={(e) => setStorageConfig({ ...storageConfig, gcsKeyFileContents: e.target.value })}
                        placeholder='{"type": "service_account", "project_id": "...", ...}'
                        rows={6}
                        className={inputClass}
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Paste service account JSON key file contents here. Alternative to key file path.
                      </p>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="gcsPublicBucket"
                        checked={storageConfig.gcsPublicBucket || false}
                        onChange={(e) => setStorageConfig({ ...storageConfig, gcsPublicBucket: e.target.checked })}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      <label htmlFor="gcsPublicBucket" className={`ml-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Public bucket (files accessible via public URLs)
                      </label>
                    </div>
                  </>
                )}

                {storageConfig.type === 'gdrive' && (
                  <>
                    <div>
                      <label className={labelClass}>
                        Client ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={storageConfig.gdriveClientId || ''}
                        onChange={(e) => setStorageConfig({ ...storageConfig, gdriveClientId: e.target.value })}
                        placeholder="xxxxx.apps.googleusercontent.com"
                        className={inputClass}
                        required
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        OAuth2 client ID from Google Cloud Console
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Client Secret <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={storageConfig.gdriveClientSecret || ''}
                        onChange={(e) => setStorageConfig({ ...storageConfig, gdriveClientSecret: e.target.value })}
                        placeholder="GOCSPX-..."
                        className={inputClass}
                        required
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        OAuth2 client secret from Google Cloud Console
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Root Folder ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={storageConfig.gdriveRootFolderId || ''}
                        onChange={(e) => setStorageConfig({ ...storageConfig, gdriveRootFolderId: e.target.value })}
                        placeholder="1AbC2dEf3GhI4jKl5MnOp6QrSt7UvWx8Yz"
                        className={inputClass}
                        required
                      />
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Google Drive folder ID where files will be stored. Get this from the folder URL: drive.google.com/drive/folders/[FOLDER_ID]
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className={labelClass}>OAuth2 Authentication</label>
                          <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {gdriveTokenStatus === 'valid' && (
                              <span className="text-green-500">✓ Tokens are valid</span>
                            )}
                            {gdriveTokenStatus === 'expired' && (
                              <span className="text-yellow-500">⚠ Tokens expired - refresh needed</span>
                            )}
                            {gdriveTokenStatus === 'missing' && (
                              <span className="text-red-500">✗ No tokens - authentication required</span>
                            )}
                            {!gdriveTokenStatus && storageConfig.gdriveAccessToken && (
                              <span className="text-gray-500">Tokens configured</span>
                            )}
                            {!gdriveTokenStatus && !storageConfig.gdriveAccessToken && (
                              <span className="text-gray-500">Click "Connect to Google Drive" to authenticate</span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!storageConfig.gdriveClientId || !storageConfig.gdriveClientSecret) {
                              setStorageError('Client ID and Client Secret are required');
                              return;
                            }
                            try {
                              const response = await bludesignApi.getGDriveAuthUrl(
                                storageConfig.gdriveClientId,
                                storageConfig.gdriveClientSecret
                              );
                              setGdriveAuthUrl(response.authUrl);
                              // Open in popup
                              const popup = window.open(
                                response.authUrl,
                                'gdrive-auth',
                                'width=600,height=700,scrollbars=yes,resizable=yes'
                              );
                              
                              // Listen for OAuth callback
                              const checkInterval = setInterval(() => {
                                if (popup?.closed) {
                                  clearInterval(checkInterval);
                                  // Check if we have tokens (user would need to paste code manually for now)
                                  // In production, you'd use a proper OAuth callback URL
                                }
                              }, 1000);
                            } catch (error: any) {
                              setStorageError(error.message || 'Failed to get OAuth URL');
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                          Connect to Google Drive
                        </button>
                      </div>
                      {gdriveAuthUrl && (
                        <div className={`p-3 rounded-lg ${isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
                          <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
                            Authorization URL generated. Complete the OAuth flow in the popup window.
                            After authorization, paste the authorization code below:
                          </p>
                          <input
                            type="text"
                            placeholder="Paste authorization code here"
                            className={`mt-2 ${inputClass}`}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && e.currentTarget.value) {
                                try {
                                  const response = await bludesignApi.exchangeGDriveCode(
                                    e.currentTarget.value,
                                    storageConfig.gdriveClientId!,
                                    storageConfig.gdriveClientSecret!
                                  );
                                  setStorageConfig({
                                    ...storageConfig,
                                    gdriveAccessToken: response.tokens.accessToken,
                                    gdriveRefreshToken: response.tokens.refreshToken,
                                  });
                                  setGdriveTokenStatus('valid');
                                  setGdriveAuthUrl(null);
                                  e.currentTarget.value = '';
                                } catch (error: any) {
                                  setStorageError(error.message || 'Failed to exchange code for tokens');
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                      {(storageConfig.gdriveAccessToken || storageConfig.gdriveRefreshToken) && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!storageConfig.gdriveRefreshToken) {
                                setStorageError('Refresh token is required');
                                return;
                              }
                              try {
                                const response = await bludesignApi.refreshGDriveTokens(
                                  storageConfig.gdriveClientId!,
                                  storageConfig.gdriveClientSecret!,
                                  storageConfig.gdriveRefreshToken
                                );
                                setStorageConfig({
                                  ...storageConfig,
                                  gdriveAccessToken: response.tokens.accessToken,
                                  gdriveRefreshToken: response.tokens.refreshToken || storageConfig.gdriveRefreshToken,
                                });
                                setGdriveTokenStatus('valid');
                              } catch (error: any) {
                                setStorageError(error.message || 'Failed to refresh tokens');
                                setGdriveTokenStatus('expired');
                              }
                            }}
                            className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
                          >
                            Refresh Tokens
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Error/Success Messages */}
              <AnimatePresence>
                {storageError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 flex items-center gap-2 text-red-500 text-sm"
                  >
                    <ExclamationCircleIcon className="w-4 h-4" />
                    {storageError}
                  </motion.div>
                )}
                {storageSaved && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 flex items-center gap-2 text-green-500 text-sm"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Storage configuration saved successfully.
                  </motion.div>
                )}
                {testConnectionSuccess && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 flex items-center gap-2 text-green-500 text-sm"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Connection test passed.
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-150
                    ${isTestingConnection
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:opacity-90'
                    }
                    ${isDark
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    }
                  `}
                >
                  {isTestingConnection ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={handleSaveStorage}
                  disabled={isStorageSaving}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-150
                    ${isStorageSaving
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:opacity-90'
                    }
                    bg-primary-600 text-white
                  `}
                >
                  {isStorageSaving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
              </>
              )}
            </motion.div>
          )}

          {/* Facility Linking Section */}
          {activeTab === 'links' && (
            <motion.div
              key="links"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`
                rounded-xl p-6 border
                ${isDark 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200 shadow-sm'
                }
              `}
            >
              <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Facility Linking
              </h2>
              
              <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Link your BluLok and BluFMS facilities to 3D BluDesign facility models for 
                visualization and management.
              </p>

              {isLoadingLinks ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Link BluLok facilities to BluDesign 3D models */}
                  <div className="space-y-3">
                    <div className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      Your BluLok Facilities
                    </div>
                    {blulokFacilities.length === 0 ? (
                      <div className={`text-center py-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        No BluLok facilities available.
                      </div>
                    ) : (
                      blulokFacilities.map((bl) => {
                        // Find currently linked BluDesign facility for this BluLok facility
                        const linkedBd = bluDesignFacilities.find(f => f.linkedBlulokId === bl.id);
                        const isSaving = linkSaving === linkedBd?.id || linkSaving === bl.id;
                        const justSaved = linkSaved === linkedBd?.id || linkSaved === bl.id;
                        return (
                          <div
                            key={bl.id}
                            className={`
                              flex items-center justify-between p-4 rounded-lg border transition-colors
                              ${justSaved 
                                ? isDark ? 'bg-green-900/30 border-green-700' : 'bg-green-50 border-green-300'
                                : isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                            `}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {bl.name}
                                </span>
                                <span className={`
                                  px-2 py-0.5 rounded-full text-xs font-medium uppercase
                                  ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'}
                                `}>
                                  BluLok
                                </span>
                                {justSaved && (
                                  <span className="text-green-500 text-xs flex items-center gap-1">
                                    <CheckCircleIcon className="w-3 h-3" />
                                    Saved
                                  </span>
                                )}
                              </div>
                              {linkedBd ? (
                                <div className={`text-xs mt-1 ${isDark ? 'text-green-400/80' : 'text-green-600'}`}>
                                  3D Model: {linkedBd.name}
                                </div>
                              ) : (
                                <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  No 3D model linked
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                value={linkedBd?.id || ''}
                                onChange={(e) => {
                                  const bdId = e.target.value || null;
                                  if (bdId) {
                                    handleLinkFacility(bdId, bl.id);
                                  } else if (linkedBd) {
                                    handleLinkFacility(linkedBd.id, null);
                                  }
                                }}
                                disabled={isSaving}
                                className={linkSelectClass(isSaving)}
                              >
                                <option value="">No 3D model linked</option>
                                {bluDesignFacilities.map((bd) => (
                                  <option
                                    key={bd.id}
                                    value={bd.id}
                                    disabled={!!(bd.linkedBlulokId && bd.linkedBlulokId !== bl.id)}
                                  >
                                    {bd.name}
                                    {bd.linkedBlulokId && bd.linkedBlulokId !== bl.id ? ' (linked to another)' : ''}
                                  </option>
                                ))}
                              </select>
                              {linkedBd && (
                                <button
                                  type="button"
                                  onClick={() => handleLinkFacility(linkedBd.id, null)}
                                  disabled={isSaving}
                                  title="Clear link"
                                  aria-label={`Clear link for ${bl.name}`}
                                  className={clearLinkButtonClass(isSaving)}
                                >
                                  <LinkSlashIcon className="w-4 h-4" />
                                  Clear
                                </button>
                              )}
                              {isSaving && (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Manage links from the 3D model side */}
                  <div className={`space-y-3 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      Your 3D Models
                    </div>
                    {bluDesignFacilities.length === 0 ? (
                      <div className={`text-center py-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        No 3D models available. Create a facility in BluDesign first.
                      </div>
                    ) : (
                      bluDesignFacilities.map((bd) => {
                        const isSaving = linkSaving === bd.id;
                        const justSaved = linkSaved === bd.id;
                        return (
                          <div
                            key={bd.id}
                            className={`
                              flex items-center justify-between p-4 rounded-lg border transition-colors
                              ${justSaved
                                ? isDark ? 'bg-green-900/30 border-green-700' : 'bg-green-50 border-green-300'
                                : isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}
                            `}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {bd.name}
                                </span>
                                <span className={`
                                  px-2 py-0.5 rounded-full text-xs font-medium uppercase
                                  ${isDark ? 'bg-primary-500/20 text-primary-300' : 'bg-primary-100 text-primary-700'}
                                `}>
                                  3D Model
                                </span>
                                {justSaved && (
                                  <span className="text-green-500 text-xs flex items-center gap-1">
                                    <CheckCircleIcon className="w-3 h-3" />
                                    Saved
                                  </span>
                                )}
                              </div>
                              {bd.linkedBlulokId ? (
                                <div className={`text-xs mt-1 ${isDark ? 'text-green-400/80' : 'text-green-600'}`}>
                                  Linked to: {bd.linkedBlulokName ?? 'Unknown facility'}
                                </div>
                              ) : (
                                <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  Not linked to a BluLok facility
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                value={bd.linkedBlulokId || ''}
                                onChange={(e) => {
                                  const blId = e.target.value || null;
                                  if (blId) {
                                    handleLinkFacility(bd.id, blId);
                                  } else if (bd.linkedBlulokId) {
                                    handleLinkFacility(bd.id, null);
                                  }
                                }}
                                disabled={isSaving}
                                className={linkSelectClass(isSaving)}
                              >
                                <option value="">No BluLok facility linked</option>
                                {blulokFacilities.map((bl) => (
                                  <option
                                    key={bl.id}
                                    value={bl.id}
                                    disabled={!!bluDesignFacilities.some(
                                      (other) => other.id !== bd.id && other.linkedBlulokId === bl.id
                                    )}
                                  >
                                    {bl.name}
                                    {bluDesignFacilities.some(
                                      (other) => other.id !== bd.id && other.linkedBlulokId === bl.id
                                    ) ? ' (linked to another model)' : ''}
                                  </option>
                                ))}
                              </select>
                              {bd.linkedBlulokId && (
                                <button
                                  type="button"
                                  onClick={() => handleLinkFacility(bd.id, null)}
                                  disabled={isSaving}
                                  title="Clear link"
                                  aria-label={`Clear link for ${bd.name}`}
                                  className={clearLinkButtonClass(isSaving)}
                                >
                                  <LinkSlashIcon className="w-4 h-4" />
                                  Clear
                                </button>
                              )}
                              {isSaving && (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Note about creating 3D models */}
                  {bluDesignFacilities.length === 0 && (
                    <div className={`
                      p-4 rounded-lg border-2 border-dashed
                      ${isDark ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'}
                    `}>
                      <p className="text-sm text-center">
                        No 3D models available. Create a facility in BluDesign first, then come back here to link it.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Cache Management Section */}
          {activeTab === 'cache' && (
            <motion.div
              key="cache"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`
                rounded-xl p-6 border
                ${isDark 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200 shadow-sm'
                }
              `}
            >
              <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Cache Management
              </h2>
              
              <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Clear locally stored data including draft saves, generated thumbnails, and cached preferences.
                This does not affect your saved facilities on the server.
              </p>

              {/* Cache Stats */}
              <div className={`
                grid grid-cols-3 gap-4 mb-6 p-4 rounded-lg
                ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}
              `}>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {cacheStats.totalSize}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Total Cache Size
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {cacheStats.thumbnailCount}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Cached Thumbnails
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${cacheStats.draftSize > 0 ? 'text-amber-500' : isDark ? 'text-white' : 'text-gray-900'}`}>
                    {cacheStats.draftSize > 0 ? 'Yes' : 'No'}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Unsaved Draft
                  </div>
                </div>
              </div>

              {/* Individual Clear Options */}
              <div className="space-y-3 mb-6">
                {/* Clear Draft */}
                <div className={`
                  flex items-center justify-between p-4 rounded-lg border
                  ${isDark 
                    ? 'bg-gray-800/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                  }
                `}>
                  <div>
                    <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Auto-Save Draft
                    </div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {cacheStats.draftSize > 0 
                        ? `${(cacheStats.draftSize / 1024).toFixed(1)} KB - Unsaved work in progress`
                        : 'No draft saved'
                      }
                    </div>
                  </div>
                  <button
                    onClick={clearDraft}
                    disabled={cacheStats.draftSize === 0}
                    className={`
                      px-3 py-1.5 rounded-lg text-xs font-medium
                      transition-all duration-150
                      ${cacheStats.draftSize === 0
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:opacity-90'
                      }
                      ${isDark 
                        ? 'bg-gray-700 text-gray-300' 
                        : 'bg-gray-200 text-gray-700'
                      }
                    `}
                  >
                    Clear
                  </button>
                </div>

                {/* Clear Thumbnails */}
                <div className={`
                  flex items-center justify-between p-4 rounded-lg border
                  ${isDark 
                    ? 'bg-gray-800/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                  }
                `}>
                  <div>
                    <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Asset Thumbnails
                    </div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {cacheStats.thumbnailCount > 0 
                        ? `${cacheStats.thumbnailCount} cached thumbnails`
                        : 'No thumbnails cached'
                      }
                    </div>
                  </div>
                  <button
                    onClick={clearThumbnails}
                    disabled={cacheStats.thumbnailCount === 0}
                    className={`
                      px-3 py-1.5 rounded-lg text-xs font-medium
                      transition-all duration-150
                      ${cacheStats.thumbnailCount === 0
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:opacity-90'
                      }
                      ${isDark 
                        ? 'bg-gray-700 text-gray-300' 
                        : 'bg-gray-200 text-gray-700'
                      }
                    `}
                  >
                    Clear
                  </button>
                </div>

                {/* Panel Layout & Preferences info */}
                <div className={`
                  flex items-center justify-between p-4 rounded-lg border
                  ${isDark 
                    ? 'bg-gray-800/50 border-gray-700' 
                    : 'bg-gray-50 border-gray-200'
                  }
                `}>
                  <div>
                    <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Preferences & Layout
                    </div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Panel positions, custom themes, skins, and editor preferences
                    </div>
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Cleared with "Clear All"
                  </div>
                </div>
              </div>

              {/* Success Message */}
              <AnimatePresence>
                {cacheCleared && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 flex items-center gap-2 text-green-500 text-sm"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Cache cleared successfully.
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Clear All Button */}
              <div className={`flex items-center justify-between pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div>
                  <div className={`text-sm font-medium text-red-500`}>
                    Clear All Cache
                  </div>
                  <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Removes all BluDesign local data including drafts, thumbnails, custom themes, skins, and preferences
                  </div>
                </div>
                <button
                  onClick={clearAllCache}
                  disabled={isClearing}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-150
                    ${isClearing
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:opacity-90'
                    }
                    bg-red-600 text-white
                  `}
                >
                  <TrashIcon className="w-4 h-4" />
                  {isClearing ? 'Clearing...' : 'Clear All'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BluDesignConfigPage;



