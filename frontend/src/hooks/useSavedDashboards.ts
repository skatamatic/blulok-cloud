import { useCallback, useEffect, useState } from 'react';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { DashboardLayoutApiResponse } from '@/types/widget-management.types';

export interface SavedDashboardListItem {
  id: string;
  name: string;
  description: string | null;
  pageCount: number;
  widgetCount: number;
  createdBy: string;
  createdByEmail?: string;
  updatedAt: string;
}

interface UseSavedDashboardsOptions {
  enabled: boolean;
  onLoaded: (response: DashboardLayoutApiResponse) => void;
  onBeforeSave?: () => Promise<void>;
}

export function useSavedDashboards({ enabled, onLoaded, onBeforeSave }: UseSavedDashboardsOptions) {
  const { addToast } = useToast();
  const [dashboards, setDashboards] = useState<SavedDashboardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.listSavedDashboards();
      setDashboards((response.dashboards ?? []) as SavedDashboardListItem[]);
    } catch (err) {
      console.error('Failed to list saved dashboards:', err);
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Could not load saved dashboards';
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

  const saveCurrent = useCallback(
    async (name: string, description?: string) => {
      setIsSaving(true);
      try {
        if (onBeforeSave) {
          try {
            await onBeforeSave();
          } catch {
            addToast({
              type: 'error',
              title: 'Save failed',
              message:
                'Could not persist your current layout before saving the template. Try again.',
            });
            return false;
          }
        }
        await apiService.createSavedDashboard({ name, description });
        addToast({
          type: 'success',
          title: 'Dashboard saved',
          message: `"${name}" was added to the library.`,
        });
        await refresh();
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not save dashboard';
        addToast({ type: 'error', title: 'Save failed', message });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [addToast, refresh, onBeforeSave]
  );

  const loadDashboard = useCallback(
    async (id: string) => {
      setActionId(id);
      try {
        const response = await apiService.loadSavedDashboard(id);
        onLoaded(response as DashboardLayoutApiResponse);
        addToast({
          type: 'success',
          title: 'Dashboard loaded',
          message: 'Your working dashboard was replaced with the saved layout.',
        });
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not load dashboard';
        addToast({ type: 'error', title: 'Load failed', message });
        return false;
      } finally {
        setActionId(null);
      }
    },
    [addToast, onLoaded]
  );

  const updateExisting = useCallback(
    async (id: string) => {
      setIsSaving(true);
      try {
        if (onBeforeSave) {
          try {
            await onBeforeSave();
          } catch {
            addToast({
              type: 'error',
              title: 'Update failed',
              message:
                'Could not persist your current layout before updating the template. Try again.',
            });
            return false;
          }
        }
        const response = await apiService.updateSavedDashboardSnapshot(id);
        const name =
          (response as { dashboard?: { name?: string } })?.dashboard?.name ??
          dashboards.find((d) => d.id === id)?.name ??
          'Template';
        addToast({
          type: 'success',
          title: 'Template updated',
          message: `"${name}" now matches your current dashboard. Assigned users will receive the update.`,
        });
        await refresh();
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not update template';
        addToast({ type: 'error', title: 'Update failed', message });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [addToast, dashboards, refresh, onBeforeSave]
  );

  const renameDashboard = useCallback(
    async (id: string, name: string, description?: string | null) => {
      setActionId(id);
      try {
        await apiService.renameSavedDashboard(id, { name, description });
        addToast({
          type: 'success',
          title: 'Dashboard renamed',
          message: `Saved as "${name}".`,
        });
        await refresh();
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not rename dashboard';
        addToast({ type: 'error', title: 'Rename failed', message });
        return false;
      } finally {
        setActionId(null);
      }
    },
    [addToast, refresh]
  );

  const deleteDashboard = useCallback(
    async (id: string) => {
      setActionId(id);
      try {
        await apiService.deleteSavedDashboard(id);
        addToast({
          type: 'success',
          title: 'Dashboard deleted',
          message: 'The saved dashboard was removed from the library.',
        });
        await refresh();
        return true;
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? 'Could not delete dashboard';
        addToast({ type: 'error', title: 'Delete failed', message });
        return false;
      } finally {
        setActionId(null);
      }
    },
    [addToast, refresh]
  );

  return {
    dashboards,
    isLoading,
    error,
    isSaving,
    actionId,
    refresh,
    saveCurrent,
    updateExisting,
    loadDashboard,
    renameDashboard,
    deleteDashboard,
  };
}
