import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { apiService } from '@/services/api.service';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CloudIcon,
  FolderIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

type ProviderType = 'local' | 'gcs' | 'gdrive';

interface TestStep {
  step: string;
  status: 'passed' | 'failed';
  detail?: string;
  durationMs?: number;
}

interface ProviderConfig {
  basePath?: string;
  bucketName?: string;
  projectId?: string;
  keyFilePath?: string;
  keyFileContents?: string;
  clientId?: string;
  clientSecret?: string;
  rootFolderId?: string;
  accessToken?: string;
  refreshToken?: string;
}

const STEP_LABELS: Record<string, string> = {
  initialize: 'Initialize',
  write: 'Write File',
  read: 'Read Back',
  delete: 'Delete File',
};

export default function StorageSettingsTab() {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [providerType, setProviderType] = useState<ProviderType>('local');
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>({});
  const [configSource, setConfigSource] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testSteps, setTestSteps] = useState<TestStep[] | null>(null);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiService.get('/admin/storage-config');
      if (data.success && data.config) {
        setProviderType(data.config.providerType || 'local');
        setProviderConfig(data.config.providerConfig || {});
        setConfigSource(data.config.source || null);
      }
    } catch (err) {
      console.error('Failed to load storage config:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const updateConfig = (updates: Partial<ProviderConfig>) => {
    setProviderConfig((prev) => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleProviderChange = (type: ProviderType) => {
    setProviderType(type);
    setProviderConfig({});
    setHasUnsavedChanges(true);
    setSaveSuccess(false);
    setSaveError(null);
    setTestSteps(null);
    setTestSuccess(null);
    setTestError(null);
  };

  const buildPayload = (): Record<string, unknown> => {
    const cfg: Record<string, unknown> = {};
    if (providerType === 'local') {
      cfg.basePath = providerConfig.basePath || './storage/firmware';
    } else if (providerType === 'gcs') {
      cfg.bucketName = providerConfig.bucketName;
      cfg.projectId = providerConfig.projectId;
      if (providerConfig.keyFilePath) cfg.keyFilePath = providerConfig.keyFilePath;
      if (providerConfig.keyFileContents) cfg.keyFileContents = providerConfig.keyFileContents;
    } else if (providerType === 'gdrive') {
      cfg.clientId = providerConfig.clientId;
      cfg.clientSecret = providerConfig.clientSecret;
      cfg.rootFolderId = providerConfig.rootFolderId;
      if (providerConfig.accessToken) cfg.accessToken = providerConfig.accessToken;
      if (providerConfig.refreshToken) cfg.refreshToken = providerConfig.refreshToken;
    }
    return cfg;
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestSteps(null);
    setTestSuccess(null);
    setTestError(null);
    try {
      const data = await apiService.post('/admin/storage-config/test', { providerType, providerConfig: buildPayload() });
      setTestSteps(data.steps || []);
      setTestSuccess(data.success);
      if (!data.success) setTestError(data.message || 'Test failed');
    } catch (err: any) {
      const body = err.response?.data;
      setTestSteps(body?.steps || null);
      setTestSuccess(false);
      setTestError(body?.message || err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);
    try {
      const data = await apiService.put('/admin/storage-config', { providerType, providerConfig: buildPayload() });
      if (data.success) {
        setSaveSuccess(true);
        setHasUnsavedChanges(false);
        setConfigSource('database');
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        setSaveError(data.message || 'Failed to save');
      }
    } catch (err: any) {
      setSaveError(err.response?.data?.message || err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = `w-full px-3 py-2 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`;
  const labelClass = `block text-sm font-medium mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Source Badge */}
      {configSource && (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${configSource === 'database' ? (isDark ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-green-50 text-green-700 border border-green-200') : (isDark ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' : 'bg-yellow-50 text-yellow-700 border border-yellow-200')}`}>
          {configSource === 'database'
            ? <><CheckCircleIcon className="w-3.5 h-3.5" /> Saved in database</>
            : <><ExclamationTriangleIcon className="w-3.5 h-3.5" /> Using environment fallback</>
          }
        </div>
      )}

      {/* Main Card */}
      <div className={`rounded-xl p-6 border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
        <h2 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Storage Provider</h2>
        <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Choose where firmware binaries and system data are stored. The test button performs a full write, read-back, and delete cycle.
        </p>

        {/* Provider Selection */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {([
            { type: 'local' as const, label: 'Local Filesystem', icon: FolderIcon },
            { type: 'gcs' as const, label: 'Google Cloud Storage', icon: CloudIcon },
            { type: 'gdrive' as const, label: 'Google Drive', icon: CloudIcon },
          ]).map((p) => (
            <button key={p.type} onClick={() => handleProviderChange(p.type)} className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-150 ${providerType === p.type ? 'border-primary-500 bg-primary-500/10' : isDark ? 'border-gray-700 hover:border-gray-600 bg-gray-800/50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}>
              <p.icon className={`w-6 h-6 ${providerType === p.type ? 'text-primary-500' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              <span className={`text-sm font-medium text-center leading-tight ${providerType === p.type ? 'text-primary-500' : isDark ? 'text-gray-300' : 'text-gray-700'}`}>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Provider Config Forms */}
        <div className="space-y-4 mb-6">
          {providerType === 'local' && (
            <div>
              <label className={labelClass}>Storage Path</label>
              <input type="text" value={providerConfig.basePath ?? ''} onChange={(e) => updateConfig({ basePath: e.target.value })} placeholder="./storage/firmware" className={inputClass} />
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Relative to the application root directory</p>
            </div>
          )}
          {providerType === 'gcs' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Project ID <span className="text-red-500">*</span></label>
                  <input type="text" value={providerConfig.projectId ?? ''} onChange={(e) => updateConfig({ projectId: e.target.value })} placeholder="my-gcp-project" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Bucket Name <span className="text-red-500">*</span></label>
                  <input type="text" value={providerConfig.bucketName ?? ''} onChange={(e) => updateConfig({ bucketName: e.target.value })} placeholder="blulok-firmware" className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Service Account Key File Path</label>
                <input type="text" value={providerConfig.keyFilePath ?? ''} onChange={(e) => updateConfig({ keyFilePath: e.target.value })} placeholder="/path/to/service-account-key.json" className={inputClass} />
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Leave empty to use default credentials</p>
              </div>
              <div>
                <label className={labelClass}>Service Account Key File Contents</label>
                <textarea value={providerConfig.keyFileContents ?? ''} onChange={(e) => updateConfig({ keyFileContents: e.target.value })} placeholder='{"type": "service_account", ...}' rows={4} className={inputClass} />
              </div>
            </>
          )}
          {providerType === 'gdrive' && (
            <>
              <div>
                <label className={labelClass}>Client ID <span className="text-red-500">*</span></label>
                <input type="text" value={providerConfig.clientId ?? ''} onChange={(e) => updateConfig({ clientId: e.target.value })} placeholder="xxxxx.apps.googleusercontent.com" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Client Secret <span className="text-red-500">*</span></label>
                <input type="password" value={providerConfig.clientSecret ?? ''} onChange={(e) => updateConfig({ clientSecret: e.target.value })} placeholder="GOCSPX-..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Root Folder ID <span className="text-red-500">*</span></label>
                <input type="text" value={providerConfig.rootFolderId ?? ''} onChange={(e) => updateConfig({ rootFolderId: e.target.value })} placeholder="1AbC2dEf3GhI..." className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Access Token</label>
                  <input type="password" value={providerConfig.accessToken ?? ''} onChange={(e) => updateConfig({ accessToken: e.target.value })} placeholder="ya29.a0..." className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Refresh Token</label>
                  <input type="password" value={providerConfig.refreshToken ?? ''} onChange={(e) => updateConfig({ refreshToken: e.target.value })} placeholder="1//0..." className={inputClass} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Test Results */}
        <AnimatePresence>
          {testSteps && testSteps.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="mb-6">
              <div className={`rounded-lg border overflow-hidden ${testSuccess ? (isDark ? 'border-green-800' : 'border-green-200') : (isDark ? 'border-red-800' : 'border-red-200')}`}>
                <div className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${testSuccess ? (isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-700') : (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700')}`}>
                  {testSuccess ? <><CheckCircleIcon className="w-4 h-4" /> All tests passed</> : <><ExclamationCircleIcon className="w-4 h-4" /> {testError}</>}
                </div>
                <div className={isDark ? 'bg-gray-900/50' : 'bg-white'}>
                  {testSteps.map((step, i) => (
                    <div key={step.step} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? (isDark ? 'border-t border-gray-800' : 'border-t border-gray-100') : ''}`}>
                      <div className="flex items-center gap-2">
                        {step.status === 'passed' ? <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" /> : <ExclamationCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />}
                        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{STEP_LABELS[step.step] || step.step}</span>
                        {step.detail && <span className={`text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}>&mdash; {step.detail}</span>}
                      </div>
                      {step.durationMs != null && <span className={`text-xs tabular-nums ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{step.durationMs}ms</span>}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <AnimatePresence>
          {saveError && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4 flex items-center gap-2 text-red-500 text-sm"><ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" /> {saveError}</motion.div>}
          {saveSuccess && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4 flex items-center gap-2 text-green-500 text-sm"><CheckCircleIcon className="w-4 h-4 flex-shrink-0" /> Configuration saved successfully.</motion.div>}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div>{hasUnsavedChanges && <span className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>Unsaved changes</span>}</div>
          <div className="flex gap-3">
            <button onClick={handleTest} disabled={isTesting} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${isTesting ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'} ${isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-900 hover:bg-gray-300'}`}>
              <ArrowPathIcon className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={handleSave} disabled={isSaving} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'} bg-primary-600 text-white`}>
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
