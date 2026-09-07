/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardAssignments } from '@/hooks/useDashboardAssignments';
import { apiService } from '@/services/api.service';
import { ToastProvider } from '@/contexts/ToastContext';
import { UserRole } from '@/types/auth.types';
import type { ReactNode } from 'react';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    listDashboardAssignments: (...args: unknown[]) => mockList(...args),
    createDashboardAssignment: (...args: unknown[]) => mockCreate(...args),
    updateDashboardAssignment: (...args: unknown[]) => mockUpdate(...args),
    deleteDashboardAssignment: (...args: unknown[]) => mockDelete(...args),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

const sampleAssignment = {
  id: 'assign-1',
  savedDashboardId: 'dash-1',
  savedDashboardName: 'Ops',
  scope: 'global' as const,
  facilityId: null,
  facilityName: null,
  userId: null,
  userEmail: null,
  userName: null,
  targetRole: UserRole.FACILITY_ADMIN,
  priority: 1,
  createdBy: 'admin',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('useDashboardAssignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue({ assignments: [sampleAssignment] });
    mockCreate.mockResolvedValue({ success: true });
    mockUpdate.mockResolvedValue({ success: true });
    mockDelete.mockResolvedValue({ success: true });
  });

  it('loads assignments when enabled', async () => {
    const { result } = renderHook(() => useDashboardAssignments({ enabled: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.assignments).toHaveLength(1);
    expect(result.current.assignments[0].id).toBe('assign-1');
  });

  it('skips load when disabled', async () => {
    renderHook(() => useDashboardAssignments({ enabled: false }), { wrapper });
    await waitFor(() => expect(mockList).not.toHaveBeenCalled());
  });

  it('createAssignment refreshes list on success', async () => {
    const { result } = renderHook(() => useDashboardAssignments(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.createAssignment({
        savedDashboardId: 'dash-2',
        scope: 'facility',
        facilityId: 'fac-1',
        targetRole: UserRole.TENANT,
      });
    });

    expect(ok).toBe(true);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('deleteAssignment returns false on API error', async () => {
    mockDelete.mockRejectedValueOnce({ response: { data: { message: 'denied' } } });
    const { result } = renderHook(() => useDashboardAssignments(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.deleteAssignment('assign-1');
    });

    expect(ok).toBe(false);
  });
});
