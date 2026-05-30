import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowUpTrayIcon,
  TrashIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';

type FirmwareTargetType = 'gateway' | 'lock' | 'friend_node' | 'access_control';

const TARGET_TYPE_LABELS: Record<FirmwareTargetType, string> = {
  gateway: 'Gateway',
  lock: 'Lock',
  friend_node: 'Friend Node',
  access_control: 'Access Control',
};

const TARGET_TYPE_COLORS: Record<FirmwareTargetType, string> = {
  gateway: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  lock: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  friend_node: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  access_control: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

interface FirmwareImage {
  id: string;
  version: string;
  target_type: FirmwareTargetType;
  filename: string;
  sha256_hash: string;
  size_bytes: number;
  description?: string;
  release_notes?: string;
  compatible_models?: string[];
  minimum_version?: string;
  is_active: boolean;
  uploaded_by: string;
  created_at: string;
}

export default function FirmwareManagementTab() {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firmware, setFirmware] = useState<FirmwareImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Upload form state
  const [version, setVersion] = useState('');
  const [targetType, setTargetType] = useState<FirmwareTargetType>('gateway');
  const [description, setDescription] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [compatibleModels, setCompatibleModels] = useState('');
  const [minimumVersion, setMinimumVersion] = useState('');

  // Catalog filter
  const [filterTargetType, setFilterTargetType] = useState<FirmwareTargetType | 'all'>('all');

  const loadFirmware = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiService.listFirmware(filterTargetType === 'all' ? undefined : filterTargetType);
      setFirmware(res.data || []);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load firmware list' });
    } finally {
      setLoading(false);
    }
  }, [addToast, filterTargetType]);

  useEffect(() => {
    loadFirmware();
  }, [loadFirmware]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSelectedFile(files[0]);
    setShowUploadForm(true);
  };

  const handleUpload = async () => {
    if (!selectedFile || !version.trim()) return;

    try {
      setUploading(true);
      await apiService.uploadFirmware(selectedFile, {
        version: version.trim(),
        target_type: targetType,
        description: description.trim() || undefined,
        release_notes: releaseNotes.trim() || undefined,
        compatible_models: compatibleModels.trim() || undefined,
        minimum_version: minimumVersion.trim() || undefined,
      });
      addToast({ type: 'success', title: `Firmware v${version.trim()} uploaded successfully` });
      resetUploadForm();
      loadFirmware();
    } catch (err: any) {
      addToast({ type: 'error', title: err?.response?.data?.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, ver: string) => {
    if (!confirm(`Deactivate firmware v${ver}? It will no longer be available for push.`)) return;
    try {
      await apiService.deleteFirmware(id);
      addToast({ type: 'success', title: `Firmware v${ver} deactivated` });
      loadFirmware();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to deactivate firmware' });
    }
  };

  const resetUploadForm = () => {
    setShowUploadForm(false);
    setSelectedFile(null);
    setVersion('');
    setTargetType('gateway');
    setDescription('');
    setReleaseNotes('');
    setCompatibleModels('');
    setMinimumVersion('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload Firmware</h3>

        {!showUploadForm ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isDragging
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <ArrowUpTrayIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drag and drop a firmware file here, or click to browse
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              Any file type accepted (max 250MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="h-5 w-5 text-primary-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{selectedFile?.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">({formatBytes(selectedFile?.size || 0)})</span>
              </div>
              <button onClick={resetUploadForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Device *</label>
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden w-fit">
                {(['gateway', 'lock', 'friend_node', 'access_control'] as FirmwareTargetType[]).map((tt) => (
                  <button
                    key={tt}
                    type="button"
                    onClick={() => setTargetType(tt)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      targetType === tt
                        ? 'bg-primary-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {TARGET_TYPE_LABELS[tt]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Version *</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g. 2.1.0"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum Version</label>
                <input
                  type="text"
                  value={minimumVersion}
                  onChange={(e) => setMinimumVersion(e.target.value)}
                  placeholder="e.g. 1.0.0"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Compatible Models</label>
              <input
                type="text"
                value={compatibleModels}
                onChange={(e) => setCompatibleModels(e.target.value)}
                placeholder="Comma-separated, e.g. BLK-100, BLK-200"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Release Notes</label>
              <textarea
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="What changed in this version..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={uploading || !version.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Uploading...' : 'Upload Firmware'}
              </button>
              <button
                onClick={resetUploadForm}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Firmware Catalog */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Firmware Catalog</h3>
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['all', 'gateway', 'lock', 'friend_node', 'access_control'] as const).map((tt) => (
              <button
                key={tt}
                onClick={() => setFilterTargetType(tt)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterTargetType === tt
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {tt === 'all' ? 'All' : TARGET_TYPE_LABELS[tt]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="flex-1" />
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : firmware.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No firmware uploaded yet. Upload your first firmware binary above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-3 pr-4">Version</th>
                  <th className="pb-3 pr-4">Target</th>
                  <th className="pb-3 pr-4">Filename</th>
                  <th className="pb-3 pr-4">Size</th>
                  <th className="pb-3 pr-4">SHA-256</th>
                  <th className="pb-3 pr-4">Uploaded</th>
                  <th className="pb-3 pr-4">Models</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {firmware.map((fw) => (
                  <tr key={fw.id} className="text-gray-900 dark:text-gray-200">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-primary-600 dark:text-primary-400">v{fw.version}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TARGET_TYPE_COLORS[fw.target_type || 'gateway']}`}>
                        {TARGET_TYPE_LABELS[fw.target_type || 'gateway']}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{fw.filename}</td>
                    <td className="py-3 pr-4">{formatBytes(fw.size_bytes)}</td>
                    <td className="py-3 pr-4">
                      <span
                        className="font-mono text-xs cursor-pointer hover:text-primary-500"
                        title={fw.sha256_hash}
                        onClick={() => { navigator.clipboard.writeText(fw.sha256_hash); addToast({ type: 'info', title: 'SHA-256 copied' }); }}
                      >
                        {fw.sha256_hash.substring(0, 12)}...
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(fw.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      {fw.compatible_models?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {fw.compatible_models.map((m) => (
                            <span key={m} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{m}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">All</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {fw.description || fw.release_notes ? (
                          <button
                            onClick={() => setExpandedId(expandedId === fw.id ? null : fw.id)}
                            className="p-1.5 text-gray-400 hover:text-primary-500 transition-colors"
                            title="View details"
                          >
                            <DocumentTextIcon className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleDelete(fw.id, fw.version)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="Deactivate"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expandedId && (() => {
        const fw = firmware.find(f => f.id === expandedId);
        if (!fw) return null;
        return (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">v{fw.version} Details</h3>
              <button onClick={() => setExpandedId(null)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {fw.description && (
              <div className="mb-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">{fw.description}</p>
              </div>
            )}
            {fw.release_notes && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Release Notes</h4>
                <pre className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">{fw.release_notes}</pre>
              </div>
            )}
            {fw.minimum_version && (
              <div className="mt-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">Minimum version: {fw.minimum_version}</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
