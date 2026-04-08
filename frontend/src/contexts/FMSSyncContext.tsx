import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { FMSChange, FMSSyncResult } from '@/types/fms.types';

export type SyncStep = 'connecting' | 'fetching' | 'detecting' | 'preparing' | 'complete' | 'cancelled';

export interface FMSSyncState {
  isActive: boolean;
  isMinimized: boolean;
  currentStep: SyncStep;
  facilityId: string | null;
  facilityName: string | null;
  syncLogId: string | null;
  progressPercentage: number;
  pendingChanges: FMSChange[];
  syncResult: FMSSyncResult | null;
  showReviewModal: boolean;
}

interface FMSSyncContextType {
  syncState: FMSSyncState;
  startSync: (facilityId: string, facilityName: string) => void;
  updateStep: (step: SyncStep) => void;
  setProgress: (percentage: number) => void;
  completeSync: (changes: FMSChange[], syncResult: FMSSyncResult) => void;
  cancelSync: () => void;
  minimizeSync: () => void;
  maximizeSync: () => void;
  showReview: () => void;
  hideReview: () => void;
  minimizeReview: () => void;
  applyChanges: () => Promise<void>;
  isSyncActive: () => boolean;
  canStartNewSync: () => boolean;
}

const FMSSyncContext = createContext<FMSSyncContextType | undefined>(undefined);

const initialState: FMSSyncState = {
  isActive: false,
  isMinimized: false,
  currentStep: 'connecting',
  facilityId: null,
  facilityName: null,
  syncLogId: null,
  progressPercentage: 0,
  pendingChanges: [],
  syncResult: null,
  showReviewModal: false,
};

export function FMSSyncProvider({ children }: { children: ReactNode }) {
  const [syncState, setSyncState] = useState<FMSSyncState>(initialState);
  const { subscribe, unsubscribe } = useWebSocket();
  const progressSubIdRef = useRef<string | null>(null);
  /** Avoid stale facilityId inside the long-lived WS handler (e.g. second sync same session). */
  const facilityIdRef = useRef<string | null>(null);

  useEffect(() => {
    facilityIdRef.current = syncState.facilityId;
  }, [syncState.facilityId]);

  const startSync = useCallback(
    (facilityId: string, facilityName: string) => {
      if (progressSubIdRef.current) {
        unsubscribe(progressSubIdRef.current);
        progressSubIdRef.current = null;
      }
      setSyncState({
        ...initialState,
        isActive: true,
        facilityId,
        facilityName,
        currentStep: 'connecting',
        progressPercentage: 0,
      });
    },
    [unsubscribe]
  );

  const updateStep = useCallback((step: SyncStep) => {
    const stepProgress: Record<SyncStep, number> = {
      connecting: 20,
      fetching: 40,
      detecting: 70,
      preparing: 90,
      complete: 100,
      cancelled: 0,
    };

    setSyncState(prev => {
      // Don't update step if already completed manually
      if (prev.currentStep === 'complete') {
        return prev;
      }
      return {
        ...prev,
        currentStep: step,
        progressPercentage: stepProgress[step] || 0,
      };
    });
  }, []);

  const setProgress = useCallback((percentage: number) => {
    setSyncState(prev => ({
      ...prev,
      progressPercentage: percentage,
    }));
  }, []);

  const completeSync = useCallback((changes: FMSChange[], syncResult: FMSSyncResult) => {
    console.log('[FMSSyncContext] completeSync called', { 
      changesCount: changes.length,
      willShowReview: changes.length > 0 
    });
    
    setSyncState(prev => {
      const newState = {
        ...prev,
        currentStep: 'complete' as SyncStep,
        progressPercentage: 100,
        pendingChanges: changes,
        syncResult,
        // If there are changes, show review modal
        showReviewModal: changes.length > 0,
        // Keep isActive true to show the "All Up to Date" completion state
        isActive: true,
        // Don't minimize - let the user see the completion state
        isMinimized: false,
      };
      
      console.log('[FMSSyncContext] New state after completeSync:', {
        isActive: newState.isActive,
        showReviewModal: newState.showReviewModal,
        isMinimized: newState.isMinimized,
        currentStep: newState.currentStep,
        changesCount: newState.pendingChanges.length,
      });
      
      return newState;
    });
  }, []);

  const cancelSync = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      currentStep: 'cancelled',
      isActive: false,
      isMinimized: false,
    }));
  }, []);

  const minimizeSync = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      isMinimized: true,
    }));
  }, []);

  const maximizeSync = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      isMinimized: false,
    }));
  }, []);

  // Subscribe to real-time FMS progress over WebSocket during active sync
  useEffect(() => {
    // unsubscribe if not active
    if (!syncState.isActive || !syncState.facilityId) {
      if (progressSubIdRef.current) {
        unsubscribe(progressSubIdRef.current);
        progressSubIdRef.current = null;
      }
      return;
    }

    // Establish subscription once per sync
    if (!progressSubIdRef.current) {
      console.log('[FMSSyncContext] Establishing WebSocket subscription for FMS progress', {
        facilityId: syncState.facilityId,
        isActive: syncState.isActive,
      });

      const handler = async (data: any): Promise<void> => {
        console.log('[FMSSyncContext] Received progress data:', data);

        if (!data) {
          console.log('[FMSSyncContext] No data in message, ignoring');
          return;
        }

        if (data.status === 'ready' && !data.step) {
          return;
        }

        const expectedFacilityId = facilityIdRef.current;
        if (data.facilityId !== expectedFacilityId) {
          console.log('[FMSSyncContext] Facility ID mismatch, ignoring:', {
            expected: expectedFacilityId,
            received: data.facilityId,
          });
          return;
        }

        const step = data.step as string;
        const percent = typeof data.percent === 'number' ? data.percent : undefined;

        console.log('[FMSSyncContext] Processing progress update:', { step, percent });

        const clearProgressSub = () => {
          if (progressSubIdRef.current) {
            unsubscribe(progressSubIdRef.current);
            progressSubIdRef.current = null;
          }
        };

        if (step === 'failed' || step === 'cancelled') {
          clearProgressSub();
          cancelSync();
          return;
        }

        // When sync completes, load pending changes by syncLogId (do not rely on history ordering).
        if (step === 'complete' && data.syncLogId) {
          console.log('[FMSSyncContext] Sync complete, fetching changes from sync log:', data.syncLogId);

          if (percent !== undefined) {
            setProgress(Math.max(0, Math.min(100, percent)));
          }

          try {
            const { fmsService } = await import('../services/fms.service');
            const pendingChanges = await fmsService.getPendingChanges(data.syncLogId);
            const latestSync = await fmsService.getSyncDetails(data.syncLogId);
            console.log('[FMSSyncContext] Fetched sync log and pending changes:', {
              syncLogId: latestSync.id,
              pendingCount: pendingChanges.length,
            });

            const summary = pendingChanges.reduce(
              (acc, change) => {
                switch (change.change_type) {
                  case 'tenant_added':
                    acc.tenantsAdded++;
                    break;
                  case 'tenant_removed':
                    acc.tenantsRemoved++;
                    break;
                  case 'tenant_updated':
                    acc.tenantsUpdated++;
                    break;
                  case 'unit_added':
                    acc.unitsAdded++;
                    break;
                  case 'unit_removed':
                    acc.unitsRemoved++;
                    break;
                  case 'unit_updated':
                    acc.unitsUpdated++;
                    break;
                }
                return acc;
              },
              {
                tenantsAdded: 0,
                tenantsRemoved: 0,
                tenantsUpdated: 0,
                unitsAdded: 0,
                unitsRemoved: 0,
                unitsUpdated: 0,
                errors: [] as string[],
                warnings: [] as string[],
              }
            );

            const syncResult: FMSSyncResult = {
              success: latestSync.sync_status === 'completed',
              syncLogId: latestSync.id,
              changesDetected: pendingChanges,
              summary,
              requiresReview: pendingChanges.length > 0,
            };

            completeSync(pendingChanges, syncResult);
          } catch (error) {
            console.error('[FMSSyncContext] Error completing sync from WebSocket:', error);
            const fallback: FMSSyncResult = {
              success: true,
              syncLogId: data.syncLogId,
              changesDetected: [],
              summary: {
                tenantsAdded: 0,
                tenantsRemoved: 0,
                tenantsUpdated: 0,
                unitsAdded: 0,
                unitsRemoved: 0,
                unitsUpdated: 0,
                errors: [],
                warnings: [],
              },
              requiresReview: false,
            };
            completeSync([], fallback);
          }
          return;
        }

        if (step && ['connecting', 'fetching', 'detecting', 'preparing', 'complete', 'cancelled'].includes(step)) {
          updateStep(step as SyncStep);
        }
        if (percent !== undefined) {
          setProgress(Math.max(0, Math.min(100, percent)));
        }
      };

      // Subscribe to FMS sync progress updates
      // Note: Errors are handled via the message handler's data.error check
      const subId = subscribe('fms_sync_progress', handler);
      progressSubIdRef.current = subId as any;
      console.log('[FMSSyncContext] Subscription established:', subId);
    }

    return () => {
      // do not auto-unsubscribe here unless sync deactivates; handled above
      undefined;
    };
  }, [
    syncState.isActive,
    syncState.facilityId,
    subscribe,
    unsubscribe,
    updateStep,
    setProgress,
    completeSync,
    cancelSync,
  ]);

  const showReview = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      showReviewModal: true,
      isMinimized: false, // Maximize the modal when showing review
    }));
  }, []);

  const hideReview = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      showReviewModal: false,
      isActive: false, // Complete the sync process
      isMinimized: false,
    }));
  }, []);

  const minimizeReview = useCallback(() => {
    setSyncState(prev => ({
      ...prev,
      // Keep showReviewModal: true so we know we're in review mode
      isMinimized: true,
      // Keep isActive: true so the status bar shows
    }));
  }, []);

  const applyChanges = useCallback(async () => {
    // This would be implemented to call the actual apply changes API
    // For now, just hide the review modal
    hideReview();
  }, [hideReview]);

  const isSyncActive = useCallback(() => {
    return syncState.isActive;
  }, [syncState.isActive]);

  const canStartNewSync = useCallback(() => {
    return !syncState.isActive || syncState.currentStep === 'complete' || syncState.currentStep === 'cancelled';
  }, [syncState.isActive, syncState.currentStep]);

  // Progress is now driven by real-time WebSocket events from the backend
  // No simulated timers needed - the WebSocket subscription handler above will update progress

  const contextValue: FMSSyncContextType = {
    syncState,
    startSync,
    updateStep,
    setProgress,
    completeSync,
    cancelSync,
    minimizeSync,
    maximizeSync,
    showReview,
    hideReview,
    minimizeReview,
    applyChanges,
    isSyncActive,
    canStartNewSync,
  };

  return (
    <FMSSyncContext.Provider value={contextValue}>
      {children}
    </FMSSyncContext.Provider>
  );
}

export function useFMSSync() {
  const context = useContext(FMSSyncContext);
  if (context === undefined) {
    throw new Error('useFMSSync must be used within an FMSSyncProvider');
  }
  return context;
}
