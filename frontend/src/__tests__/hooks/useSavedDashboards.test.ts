/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSavedDashboards } from '@/hooks/useSavedDashboards';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockLoad = jest.fn();
const mockUpdateSnapshot = jest.fn();
const mockRename = jest.fn();
const mockDelete = jest.fn();
const mockAddToast = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    listSavedDashboards: (...args: unknown[]) => mockList(...args),
    createSavedDashboard: (...args: unknown[]) => mockCreate(...args),
    loadSavedDashboard: (...args: unknown[]) => mockLoad(...args),
    updateSavedDashboardSnapshot: (...args: unknown[]) => mockUpdateSnapshot(...args),
    renameSavedDashboard: (...args: unknown[]) => mockRename(...args),
    deleteSavedDashboard: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

const sampleDashboards = [
  {
    id: 'dash-1',
    name: 'Ops',
    description: null,
    pageCount: 1,
    widgetCount: 2,
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('useSavedDashboards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue({ dashboards: sampleDashboards });
    mockCreate.mockResolvedValue({ success: true });
    mockLoad.mockResolvedValue({ pages: [] });
    mockUpdateSnapshot.mockResolvedValue({ dashboard: { name: 'Ops' } });
    mockRename.mockResolvedValue({ success: true });
    mockDelete.mockResolvedValue({ success: true });
  });

  it('does not refresh when disabled', async () => {
    renderHook(() =>
      useSavedDashboards({ enabled: false, onLoaded: jest.fn() })
    );

    await act(async () => {});
    expect(mockList).not.toHaveBeenCalled();
  });

  it('loads dashboards when enabled', async () => {
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn() })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.dashboards).toEqual(sampleDashboards);
    expect(result.current.error).toBeNull();
  });

  it('sets error when list fails', async () => {
    mockList.mockRejectedValueOnce({
      response: { data: { message: 'Forbidden' } },
    });

    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn() })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Forbidden');
  });

  it('saveCurrent succeeds and refreshes', async () => {
    const onBeforeSave = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn(), onBeforeSave })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.saveCurrent('New Board', 'desc');
    });

    expect(ok).toBe(true);
    expect(onBeforeSave).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({ name: 'New Board', description: 'desc' });
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Dashboard saved' })
    );
  });

  it('saveCurrent fails when onBeforeSave throws', async () => {
    const onBeforeSave = jest.fn().mockRejectedValue(new Error('persist'));
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn(), onBeforeSave })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.saveCurrent('Fail');
    });

    expect(ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Save failed' })
    );
  });

  it('saveCurrent surfaces API errors', async () => {
    mockCreate.mockRejectedValueOnce({
      response: { data: { message: 'Name taken' } },
    });
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn() })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.saveCurrent('Dup');
    });

    expect(ok).toBe(false);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Name taken' })
    );
  });

  it('loadDashboard calls onLoaded on success', async () => {
    const onLoaded = jest.fn();
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.loadDashboard('dash-1');
    });

    expect(ok).toBe(true);
    expect(mockLoad).toHaveBeenCalledWith('dash-1');
    expect(onLoaded).toHaveBeenCalledWith({ pages: [] });
    expect(result.current.actionId).toBeNull();
  });

  it('loadDashboard toasts on failure', async () => {
    mockLoad.mockRejectedValueOnce(new Error('load fail'));
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn() })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.loadDashboard('dash-1');
    });

    expect(ok).toBe(false);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Load failed' })
    );
  });

  it('updateExisting succeeds after onBeforeSave', async () => {
    const onBeforeSave = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn(), onBeforeSave })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.updateExisting('dash-1');
    });

    expect(ok).toBe(true);
    expect(mockUpdateSnapshot).toHaveBeenCalledWith('dash-1');
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Template updated' })
    );
  });

  it('updateExisting fails when onBeforeSave throws', async () => {
    const onBeforeSave = jest.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn(), onBeforeSave })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.updateExisting('dash-1');
    });

    expect(ok).toBe(false);
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
  });

  it('renameDashboard and deleteDashboard succeed', async () => {
    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn() })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      expect(await result.current.renameDashboard('dash-1', 'Renamed', null)).toBe(true);
    });
    expect(mockRename).toHaveBeenCalledWith('dash-1', { name: 'Renamed', description: null });

    await act(async () => {
      expect(await result.current.deleteDashboard('dash-1')).toBe(true);
    });
    expect(mockDelete).toHaveBeenCalledWith('dash-1');
  });

  it('renameDashboard and deleteDashboard toast on error', async () => {
    mockRename.mockRejectedValueOnce(new Error('rename fail'));
    mockDelete.mockRejectedValueOnce(new Error('delete fail'));

    const { result } = renderHook(() =>
      useSavedDashboards({ enabled: true, onLoaded: jest.fn() })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      expect(await result.current.renameDashboard('dash-1', 'X')).toBe(false);
      expect(await result.current.deleteDashboard('dash-1')).toBe(false);
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Rename failed' })
    );
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete failed' })
    );
  });
});
