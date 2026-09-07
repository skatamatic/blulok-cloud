import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { getApiBaseUrl } from '@/services/appConfig';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  FacilityProvisioningFile,
  FacilityProvisioningUploadSession,
  formatProvisioningSize,
  PROVISIONING_MAX_SIZE_BYTES,
  PROVISIONING_MAX_SIZE_MB,
  UPLOAD_SOURCE_LABELS,
} from '@/types/facility-provisioning.types';

interface FacilityProvisioningDataTabProps {
  facilityId: string;
  facilityName?: string;
}

const PAGE_SIZE = 20;

const cardClass =
  'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm';

export function FacilityProvisioningDataTab({
  facilityId,
  facilityName,
}: FacilityProvisioningDataTabProps) {
  const { addToast } = useToast();
  const { authState } = useAuth();
  const isPlatformAdmin =
    authState.user?.role === UserRole.ADMIN || authState.user?.role === UserRole.DEV_ADMIN;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FacilityProvisioningFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FacilityProvisioningFile | null>(null);

  const hasMore = files.length < total;

  const loadFiles = useCallback(
    async (opts?: { append?: boolean; silent?: boolean }) => {
      const offset = opts?.append ? files.length : 0;
      try {
        if (opts?.append) {
          setLoadingMore(true);
        } else if (!opts?.silent) {
          setLoading(true);
        }

        const res = await apiService.listFacilityProvisioningFiles(facilityId, PAGE_SIZE, offset);
        const nextFiles = res.data?.files ?? [];
        const nextTotal = res.data?.total ?? nextFiles.length;

        setTotal(nextTotal);
        setFiles((prev) => (opts?.append ? [...prev, ...nextFiles] : nextFiles));
      } catch (err: unknown) {
        addToast({
          type: 'error',
          title: 'Failed to load provisioning files',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [addToast, facilityId, files.length],
  );

  useEffect(() => {
    void loadFiles();
  }, [facilityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const putUploadBody = async (
    session: FacilityProvisioningUploadSession,
    file: File,
  ): Promise<void> => {
    const headers = new Headers(session.upload_headers || {});
    if (!headers.has('Content-Type') && file.type) {
      headers.set('Content-Type', file.type);
    }

    const response = await fetch(session.upload_url, {
      method: 'PUT',
      headers,
      body: file,
    });

    if (!response.ok) {
      let message = `Upload failed (${response.status})`;
      try {
        const payload = await response.json();
        message = payload?.message || message;
      } catch {
        // ignore non-JSON error bodies
      }
      throw new Error(message);
    }
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > PROVISIONING_MAX_SIZE_BYTES) {
      addToast({
        type: 'error',
        title: 'File too large',
        message: `Maximum provisioning file size is ${PROVISIONING_MAX_SIZE_MB} MB.`,
      });
      return;
    }

    setUploading(true);
    try {
      const prepareRes = await apiService.prepareFacilityProvisioningUpload(facilityId, {
        filename: file.name,
        size_bytes: file.size,
        content_type: file.type || undefined,
      });
      const session = prepareRes.data as FacilityProvisioningUploadSession;

      await putUploadBody(session, file);

      await apiService.completeFacilityProvisioningUpload(facilityId, {
        upload_id: session.upload_id,
        filename: file.name,
        size_bytes: file.size,
        content_type: file.type || undefined,
      });

      addToast({ type: 'success', title: 'Upload complete', message: file.name });
      await loadFiles({ silent: true });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: FacilityProvisioningFile) => {
    setDownloadingId(file.id);
    try {
      const path = apiService.getFacilityProvisioningDownloadPath(facilityId, file.id);
      const base = getApiBaseUrl().replace(/\/+$/, '');
      const url = `${base}/api/v1${path}`;
      const token = localStorage.getItem('authToken');

      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        let message = `Download failed (${response.status})`;
        try {
          const payload = await response.json();
          message = payload?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await apiService.deleteFacilityProvisioningFile(facilityId, deleteTarget.id);
      addToast({ type: 'success', title: 'File deleted', message: deleteTarget.filename });
      setDeleteTarget(null);
      await loadFiles({ silent: true });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className={`${cardClass} p-8 flex items-center justify-center`}>
        <ArrowPathIcon className="h-6 w-6 animate-spin text-[#147FD4]" aria-hidden="true" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading provisioning data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`${cardClass} p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ArchiveBoxIcon className="h-6 w-6 text-[#147FD4]" aria-hidden="true" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Provisioning data</h3>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
              Facility-scoped provisioning archives for {facilityName || 'this site'}. Upload backups from the
              dashboard (max {PROVISIONING_MAX_SIZE_MB} MB per file) and download them for gateway setup or
              field recovery workflows.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch sm:items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => void handleFileSelected(e)}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#147FD4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1269b0] active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {uploading ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  Upload file
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
              {formatProvisioningSize(PROVISIONING_MAX_SIZE_BYTES)} max
            </p>
          </div>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h4 className="font-medium text-gray-900 dark:text-white">Stored files</h4>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {total} file{total === 1 ? '' : 's'}
          </span>
        </div>

        {files.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <DocumentIcon className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">No provisioning files uploaded yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {files.map((file) => (
              <li
                key={file.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50/80 dark:hover:bg-gray-900/30 transition-colors"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-[#147FD4]/10 p-2">
                    <DocumentIcon className="h-5 w-5 text-[#147FD4]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate" title={file.filename}>
                      {file.filename}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatProvisioningSize(file.size_bytes)}
                      {' · '}
                      {UPLOAD_SOURCE_LABELS[file.upload_source] || file.upload_source}
                      {' · '}
                      {formatDateTime(file.uploaded_at)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:ml-4">
                  <button
                    type="button"
                    onClick={() => void handleDownload(file)}
                    disabled={downloadingId === file.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:border-[#147FD4]/40 hover:text-[#147FD4] dark:hover:text-[#147FD4] disabled:opacity-50 transition-colors"
                  >
                    {downloadingId === file.id ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowDownTrayIcon className="h-4 w-4" />
                    )}
                    Download
                  </button>
                  {isPlatformAdmin && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(file)}
                      disabled={deletingId === file.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                      aria-label={`Delete ${file.filename}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => void loadFiles({ append: true })}
              disabled={loadingMore}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/40 disabled:opacity-50 transition-colors"
            >
              {loadingMore ? 'Loading…' : `Load more (${files.length} of ${total})`}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete provisioning file?"
        message={
          deleteTarget
            ? `Permanently remove "${deleteTarget.filename}" from this facility? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete file"
        confirmTone="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default FacilityProvisioningDataTab;
