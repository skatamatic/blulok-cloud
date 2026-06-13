/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardState } from '@/hooks/useDashboardState';
import { ToastProvider } from '@/contexts/ToastContext';
import { DASHBOARD_STORAGE_KEY } from '@/types/widget-management.types';
import type { ReactNode } from 'react';

const mockGetWidgetLayouts = jest.fn();
const mockSaveDashboard = jest.fn();
const mockResetWidgetLayout = jest.fn();
const mockHideWidget = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getWidgetLayouts: (...args: unknown[]) => mockGetWidgetLayouts(...args),
    saveDashboard: (...args: unknown[]) => mockSaveDashboard(...args),
    resetWidgetLayout: (...args: unknown[]) => mockResetWidgetLayout(...args),
    hideWidget: (...args: unknown[]) => mockHideWidget(...args),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

const defaultApiResponse = {
  layoutSource: 'personal' as const,
  canEditLayout: true,
  allowMultiplePages: true,
  pages: [
    {
      id: 'page-1',
      name: 'Main',
      pageOrder: 0,
      widgets: [
        {
          widgetId: 'facilities_stats',
          widgetType: 'stats-facilities',
          title: 'Facilities',
          size: 'small',
          x: 0,
          y: 0,
          w: 3,
          h: 2,
        },
      ],
    },
  ],
};

describe('useDashboardState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockGetWidgetLayouts.mockResolvedValue(defaultApiResponse);
    mockSaveDashboard.mockResolvedValue({ success: true });
    mockResetWidgetLayout.mockResolvedValue(defaultApiResponse);
    mockHideWidget.mockResolvedValue({ success: true });
  });

  it('loads dashboard from API when authenticated', async () => {
    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
          activeFacilityId: 'fac-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetWidgetLayouts).toHaveBeenCalledWith('fac-1');
    expect(result.current.pages.length).toBeGreaterThan(0);
    expect(result.current.canEditLayout).toBe(true);
  });

  it('falls back to default page when API load fails', async () => {
    mockGetWidgetLayouts.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pages[0]?.name).toBe('Main');
  });

  it('addWidget appends a widget when room is available', async () => {
    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = result.current.activePage.widgetInstances.length;

    await act(async () => {
      await result.current.addWidget('histogram');
    });

    expect(result.current.activePage.widgetInstances.length).toBe(before + 1);
    expect(
      result.current.activePage.widgetInstances.some((w) => w.type === 'histogram')
    ).toBe(true);
  });

  it('removeWidget removes widget by id', async () => {
    mockGetWidgetLayouts.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const widgetId = result.current.activePage.widgetInstances[0]?.id;
    expect(widgetId).toBeTruthy();

    act(() => {
      result.current.removeWidget(widgetId!);
    });

    await waitFor(() =>
      expect(
        result.current.activePage.widgetInstances.some((w) => w.id === widgetId)
      ).toBe(false)
    );
  });

  it('setActivePage updates active page and slide direction', async () => {
    mockGetWidgetLayouts.mockResolvedValueOnce({
      ...defaultApiResponse,
      pages: [
        defaultApiResponse.pages![0],
        {
          id: 'page-2',
          name: 'Second',
          pageOrder: 1,
          widgets: [],
        },
      ],
    });

    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pages.length).toBe(2);

    act(() => {
      result.current.setActivePage(1);
    });

    expect(result.current.activePageId).toBe('page-2');
    expect(result.current.slideDirection).toBe(1);
  });

  it('resetPersonalLayout calls API and replaces layout', async () => {
    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
          activeFacilityId: 'fac-1',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.resetPersonalLayout();
    });

    expect(ok).toBe(true);
    expect(mockResetWidgetLayout).toHaveBeenCalledWith('fac-1');
  });

  it('persistLocal writes dashboard state to localStorage on commit', async () => {
    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addWidget('notifications');
    });

    const stored = localStorage.getItem(DASHBOARD_STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as { pages: unknown[] };
    expect(parsed.pages.length).toBeGreaterThan(0);
  });

  it('flushSave saves immediately when layout is editable', async () => {
    const { result } = renderHook(
      () =>
        useDashboardState({
          isAuthenticated: true,
          isTenant: false,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.flushSave();
    });

    expect(mockSaveDashboard).toHaveBeenCalled();
  });
});
