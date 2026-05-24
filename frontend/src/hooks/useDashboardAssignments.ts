import { useCallback, useEffect, useState } from 'react';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { UserRole } from '@/types/auth.types';

export type DashboardAssignmentScope = 'global' | 'facility' | 'user';

export interface DashboardAssignmentListItem {
  id: string;
  savedDashboardId: string;
  savedDashboardName: string;
  scope: DashboardAssignmentScope;
  facilityId: string | null;
  facilityName: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  targetRole: UserRole;
  priority: number;
  createdBy: string;
  updatedAt: string;
}

export interface CreateAssignmentInput {
  savedDashboardId: string;
  scope: DashboardAssignmentScope;
  facilityId?: string | null;
  userId?: string | null;
  targetRole: UserRole;
  priority?: number;
}

interface UseDashboardAssignmentsOptions {
  enabled?: boolean;
}

export function useDashboardAssignments({ enabled = true }: UseDashboardAssignmentsOptions = {}) {
  const { addToast } = useToast();
  const [assignments, setAssignments] = useState<DashboardAssignmentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.listDashboardAssignments();
      setAssignments((response.assignments ?? []) as DashboardAssignmentListItem[]);
    } catch (err) {
      console.error('Failed to list dashboard assignments:', err);
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Could not load dashboard assignments';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      void refresh();
    }
  }, [enabled, refresh]);

  const createAssignment = useCallback(
    async (input: CreateAssignmentInput) => {
      setActionId('create');
      try {
        await apiService.createDashboardAssignment(input);
        addToast({ type: 'success', title: 'Assignment created' });
        await refresh();
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not create assignment';
        addToast({ type: 'error', title: 'Create failed', message });
        return false;
      } finally {
        setActionId(null);
      }
    },
    [addToast, refresh]
  );

  const updateAssignment = useCallback(
    async (id: string, updates: { savedDashboardId?: string; priority?: number }) => {
      setActionId(id);
      try {
        await apiService.updateDashboardAssignment(id, updates);
        addToast({ type: 'success', title: 'Assignment updated' });
        await refresh();
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not update assignment';
        addToast({ type: 'error', title: 'Update failed', message });
        return false;
      } finally {
        setActionId(null);
      }
    },
    [addToast, refresh]
  );

  const deleteAssignment = useCallback(
    async (id: string) => {
      setActionId(id);
      try {
        await apiService.deleteDashboardAssignment(id);
        addToast({ type: 'success', title: 'Assignment removed' });
        await refresh();
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not delete assignment';
        addToast({ type: 'error', title: 'Delete failed', message });
        return false;
      } finally {
        setActionId(null);
      }
    },
    [addToast, refresh]
  );

  return {
    assignments,
    isLoading,
    error,
    actionId,
    refresh,
    createAssignment,
    updateAssignment,
    deleteAssignment,
  };
}
