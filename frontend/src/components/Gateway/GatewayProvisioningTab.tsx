import { useState, useEffect, useCallback, useRef } from 'react';

import {

  ArchiveBoxIcon,

  ArrowPathIcon,

  CheckCircleIcon,

  ClockIcon,

  ExclamationTriangleIcon,

  StopIcon,

  TrashIcon,

  CloudArrowUpIcon,

  ArrowDownTrayIcon,

  XCircleIcon,

} from '@heroicons/react/24/outline';

import { apiService } from '@/services/api.service';

import { useToast } from '@/contexts/ToastContext';

import { useAuth } from '@/contexts/AuthContext';

import { useWebSocket } from '@/contexts/WebSocketContext';

import { UserRole } from '@/types/auth.types';

import {

  GatewayProvisioningBackup,

  GatewayProvisioningRestore,

  ProvisioningRestoreProgress,

  PROVISIONING_TERMINAL_STATUSES,

  RESTORE_STATUS_LABELS,

  UPLOAD_SOURCE_LABELS,

  formatProvisioningSize,

} from '@/types/provisioning.types';

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/Modal/Modal';



interface GatewayProvisioningTabProps {

  gatewayId: string;

  wsConnected: boolean;

}



export default function GatewayProvisioningTab({ gatewayId, wsConnected }: GatewayProvisioningTabProps) {

  const { addToast } = useToast();

  const { authState } = useAuth();

  const ws = useWebSocket();

  const isPlatformAdmin = authState.user?.role === UserRole.ADMIN || authState.user?.role === UserRole.DEV_ADMIN;



  const [backups, setBackups] = useState<GatewayProvisioningBackup[]>([]);

  const [activeRestore, setActiveRestore] = useState<GatewayProvisioningRestore | null>(null);

  const [restoreHistory, setRestoreHistory] = useState<GatewayProvisioningRestore[]>([]);

  const [liveProgress, setLiveProgress] = useState<ProvisioningRestoreProgress | null>(null);

  const [loading, setLoading] = useState(true);

  const [requestingUpload, setRequestingUpload] = useState(false);

  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const terminalRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



  const loadData = useCallback(async (opts?: { silent?: boolean }) => {

    try {

      if (!opts?.silent) setLoading(true);

      const [listRes, statusRes] = await Promise.all([

        apiService.listGatewayProvisioningBackups(gatewayId),

        apiService.getGatewayProvisioningRestoreStatus(gatewayId),

      ]);

      setBackups(listRes.data?.backups || []);

      setActiveRestore(statusRes.data?.active || null);

      setRestoreHistory(statusRes.data?.history || []);

    } catch {

      if (!opts?.silent) {

        addToast({ type: 'error', title: 'Failed to load provisioning backups' });

      }

    } finally {

      if (!opts?.silent) setLoading(false);

    }

  }, [gatewayId, addToast]);



  useEffect(() => {

    loadData();

  }, [loadData]);



  useEffect(() => {

    const subId = ws.subscribe(

      'provisioning_restore_progress',

      (data: ProvisioningRestoreProgress) => {

        if (data.gatewayId !== gatewayId) return;



        setLiveProgress(data);



        if (PROVISIONING_TERMINAL_STATUSES.includes(data.step)) {

          setActiveRestore((prev) => (

            prev && prev.id === data.restoreId

              ? {

                  ...prev,

                  status: data.step,

                  chunks_sent: data.chunksSent ?? prev.chunks_sent,

                  chunks_total: data.chunksTotal ?? prev.chunks_total,

                  error_message: data.message ?? prev.error_message,

                }

              : prev

          ));

        } else {

          setActiveRestore((prev) => (

            prev && prev.id === data.restoreId

              ? {

                  ...prev,

                  status: data.step,

                  chunks_sent: data.chunksSent ?? prev.chunks_sent,

                  chunks_total: data.chunksTotal ?? prev.chunks_total,

                }

              : prev

          ));

        }



        if (PROVISIONING_TERMINAL_STATUSES.includes(data.step)) {

          terminalRefreshTimer.current = setTimeout(() => loadData({ silent: true }), 500);

        }

      },

    );



    return () => {

      if (subId) ws.unsubscribe(subId);

      if (terminalRefreshTimer.current) clearTimeout(terminalRefreshTimer.current);

    };

  }, [ws, gatewayId, loadData]);



  useEffect(() => {

    const isActive = activeRestore && !PROVISIONING_TERMINAL_STATUSES.includes(activeRestore.status);

    const usePollFallback = isActive && (!ws.isConnected || activeRestore?.status === 'verifying');



    if (!usePollFallback) {

      if (pollRef.current) {

        clearInterval(pollRef.current);

        pollRef.current = null;

      }

      return;

    }



    pollRef.current = setInterval(() => {

      void loadData({ silent: true });

    }, ws.isConnected ? 8000 : 4000);



    return () => {

      if (pollRef.current) {

        clearInterval(pollRef.current);

        pollRef.current = null;

      }

    };

  }, [activeRestore?.id, activeRestore?.status, loadData, ws.isConnected]);



  useEffect(() => {

    if (!activeRestore || PROVISIONING_TERMINAL_STATUSES.includes(activeRestore.status)) {

      setLiveProgress(null);

    }

  }, [activeRestore?.id, activeRestore?.status]);



  const handleRequestUpload = async () => {

    try {

      setRequestingUpload(true);

      await apiService.requestGatewayProvisioningUpload(gatewayId);

      addToast({ type: 'success', title: 'Upload request sent to gateway' });

      await loadData({ silent: true });

    } catch (err: any) {

      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to request upload' });

    } finally {

      setRequestingUpload(false);

    }

  };



  const handleRestore = async (backupId: string) => {

    setConfirmRestoreId(null);

    try {

      setRestoringId(backupId);

      const res = await apiService.restoreGatewayProvisioningBackup(gatewayId, backupId);

      setActiveRestore(res.data);

      const backup = backups.find((b) => b.id === backupId);

      setLiveProgress({

        restoreId: res.data.id,

        backupId,

        backupFilename: backup?.filename || 'backup',

        gatewayId,

        facilityId: res.data.facility_id,

        step: 'pending',

        percent: 0,

      });

      addToast({ type: 'success', title: 'Restore initiated' });

    } catch (err: any) {

      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to initiate restore' });

    } finally {

      setRestoringId(null);

    }

  };



  const handleDelete = async (backupId: string) => {

    setConfirmDeleteId(null);

    try {

      setDeleting(true);

      await apiService.deleteGatewayProvisioningBackup(gatewayId, backupId);

      addToast({ type: 'success', title: 'Backup deleted' });

      await loadData({ silent: true });

    } catch (err: any) {

      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to delete backup' });

    } finally {

      setDeleting(false);

    }

  };



  const handleCancelRestore = async () => {

    if (!activeRestore) return;

    try {

      await apiService.cancelGatewayProvisioningRestore(gatewayId, activeRestore.id);

      addToast({ type: 'info', title: 'Restore cancellation requested' });

      await loadData({ silent: true });

    } catch (err: any) {

      addToast({ type: 'error', title: err?.response?.data?.message || 'Failed to cancel restore' });

    }

  };



  const activeBackupFilename = liveProgress?.backupFilename

    ?? backups.find((b) => b.id === activeRestore?.backup_id)?.filename;



  const restorePercent = activeRestore?.chunks_total

    ? Math.round(((activeRestore.chunks_sent || 0) / activeRestore.chunks_total) * 100)

    : 0;



  const liveProgressMatchesActive = Boolean(
    liveProgress && activeRestore && liveProgress.restoreId === activeRestore.id,
  );

  const effectivePercent = liveProgressMatchesActive
    ? liveProgress!.percent
    : restorePercent;

  const effectiveStatus = liveProgressMatchesActive
    ? liveProgress!.step
    : activeRestore?.status;



  const statusIcon = (status: string) => {

    switch (status) {

      case 'complete': return <CheckCircleIcon className="h-5 w-5 text-green-500" />;

      case 'failed': return <XCircleIcon className="h-5 w-5 text-red-500" />;

      case 'cancelled': return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;

      default: return <ClockIcon className="h-5 w-5 text-blue-500" />;

    }

  };



  if (loading) {

    return (

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">

        <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />

        <div className="space-y-3">

          {[1, 2, 3].map((i) => (

            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />

          ))}

        </div>

      </div>

    );

  }



  return (

    <div className="space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">

            <ArchiveBoxIcon className="h-5 w-5 text-[#147FD4]" />

            Provisioning Data

          </h3>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">

            Mesh provisioning zip backups stored in the cloud (up to 500 MB each).

          </p>

        </div>

        <div className="flex items-center gap-2">

          <button

            type="button"

            onClick={() => loadData()}

            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"

          >

            <ArrowPathIcon className="h-4 w-4" />

            Refresh

          </button>

          <button

            type="button"

            onClick={handleRequestUpload}

            disabled={!wsConnected || requestingUpload}

            title={!wsConnected ? 'Gateway must be online' : undefined}

            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-[#147FD4] text-white hover:bg-[#126bb5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"

          >

            <CloudArrowUpIcon className="h-4 w-4" />

            {requestingUpload ? 'Requesting…' : 'Request backup from gateway'}

          </button>

        </div>

      </div>



      {activeRestore && !PROVISIONING_TERMINAL_STATUSES.includes(activeRestore.status) && (

        <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4">

          <div className="flex items-start justify-between gap-4">

            <div className="flex items-start gap-3">

              {statusIcon(effectiveStatus || activeRestore.status)}

              <div>

                <p className="font-medium text-gray-900 dark:text-white">

                  {RESTORE_STATUS_LABELS[effectiveStatus || activeRestore.status]}

                </p>

                {activeBackupFilename && (

                  <p className="text-sm text-gray-700 dark:text-gray-200 mt-0.5">

                    {activeBackupFilename}

                  </p>

                )}

                <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">

                  {activeRestore.chunks_total || liveProgressMatchesActive
                    ? `Chunks ${liveProgressMatchesActive ? (liveProgress!.chunksSent ?? activeRestore.chunks_sent) : activeRestore.chunks_sent}/${liveProgressMatchesActive ? (liveProgress!.chunksTotal ?? activeRestore.chunks_total) : activeRestore.chunks_total} (${effectivePercent}%)`
                    : 'Preparing transfer…'}

                </p>

                {(liveProgress?.message || activeRestore.error_message) && (

                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">

                    {liveProgress?.message || activeRestore.error_message}

                  </p>

                )}

              </div>

            </div>

            <button

              type="button"

              onClick={handleCancelRestore}

              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"

            >

              <StopIcon className="h-4 w-4" />

              Cancel

            </button>

          </div>

          {(activeRestore.chunks_total != null && activeRestore.chunks_total > 0) || liveProgress?.chunksTotal ? (

            <div className="mt-3 h-2 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">

              <div

                className="h-full bg-[#147FD4] transition-all duration-300"

                style={{ width: `${effectivePercent}%` }}

              />

            </div>

          ) : null}

        </div>

      )}



      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">

        {backups.length === 0 ? (

          <div className="p-8 text-center text-gray-500 dark:text-gray-400">

            <ArchiveBoxIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />

            <p>No provisioning backups yet.</p>

            <p className="text-sm mt-1">Request a backup from the gateway or wait for an autonomous upload.</p>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">

              <thead className="bg-gray-50 dark:bg-gray-900/50">

                <tr>

                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filename</th>

                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Size</th>

                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uploaded</th>

                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Source</th>

                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">

                {backups.map((backup) => (

                  <tr key={backup.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">

                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{backup.filename}</td>

                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{formatProvisioningSize(backup.size_bytes)}</td>

                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">

                      {new Date(backup.uploaded_at).toLocaleString()}

                    </td>

                    <td className="px-4 py-3">

                      <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">

                        {UPLOAD_SOURCE_LABELS[backup.upload_source]}

                      </span>

                    </td>

                    <td className="px-4 py-3 text-right">

                      <div className="inline-flex items-center gap-2">

                        <button

                          type="button"

                          onClick={() => setConfirmRestoreId(backup.id)}

                          disabled={!wsConnected || restoringId === backup.id || Boolean(activeRestore && !PROVISIONING_TERMINAL_STATUSES.includes(activeRestore.status))}

                          title={!wsConnected ? 'Gateway must be online' : undefined}

                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-[#147FD4] text-[#147FD4] hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"

                        >

                          <ArrowDownTrayIcon className="h-3.5 w-3.5" />

                          Restore

                        </button>

                        {isPlatformAdmin && (

                          <button

                            type="button"

                            onClick={() => setConfirmDeleteId(backup.id)}

                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"

                          >

                            <TrashIcon className="h-3.5 w-3.5" />

                            Delete

                          </button>

                        )}

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>



      {restoreHistory.length > 0 && (

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">

          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recent restores</h4>

          <ul className="space-y-2">

            {restoreHistory.slice(0, 5).map((restore) => (

              <li key={restore.id} className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">

                <span className="flex items-center gap-2">

                  {statusIcon(restore.status)}

                  <span>{RESTORE_STATUS_LABELS[restore.status]}</span>

                  <span className="text-gray-400">·</span>

                  <span>{new Date(restore.created_at).toLocaleString()}</span>

                </span>

                {restore.chunks_total != null && (

                  <span>{restore.chunks_sent}/{restore.chunks_total} chunks</span>

                )}

              </li>

            ))}

          </ul>

        </div>

      )}



      <Modal isOpen={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)}>

        <ModalHeader>Delete backup?</ModalHeader>

        <ModalBody>

          <p className="text-sm text-gray-600 dark:text-gray-300">

            This permanently removes the backup from cloud storage. This action cannot be undone.

          </p>

        </ModalBody>

        <ModalFooter>

          <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">

            Cancel

          </button>

          <button

            type="button"

            disabled={deleting}

            onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}

            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"

          >

            Delete

          </button>

        </ModalFooter>

      </Modal>



      <Modal isOpen={confirmRestoreId !== null} onClose={() => setConfirmRestoreId(null)}>

        <ModalHeader>Restore provisioning data?</ModalHeader>

        <ModalBody>

          <p className="text-sm text-gray-600 dark:text-gray-300">

            This will push the selected backup to the gateway over WebSocket. Existing mesh provisioning on the gateway may be overwritten.

          </p>

        </ModalBody>

        <ModalFooter>

          <button type="button" onClick={() => setConfirmRestoreId(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600">

            Cancel

          </button>

          <button

            type="button"

            onClick={() => confirmRestoreId && handleRestore(confirmRestoreId)}

            className="px-4 py-2 text-sm rounded-lg bg-[#147FD4] text-white hover:bg-[#126bb5]"

          >

            Restore

          </button>

        </ModalFooter>

      </Modal>

    </div>

  );

}


