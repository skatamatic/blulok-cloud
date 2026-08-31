/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardAssignmentRules } from '@/components/Settings/DashboardAssignmentRules';
import { UserRole } from '@/types/auth.types';

const mockUpdateAssignment = jest.fn();
const mockCreateAssignment = jest.fn();
const mockDeleteAssignment = jest.fn();
const mockRefresh = jest.fn();

jest.mock('@/hooks/useDashboardAssignments', () => ({
  useDashboardAssignments: () => ({
    assignments: [
      {
        id: 'assign-1',
        savedDashboardId: 'tpl-1',
        savedDashboardName: 'Staff Layout',
        scope: 'global',
        facilityId: null,
        facilityName: null,
        userId: null,
        userEmail: null,
        userName: null,
        targetRole: UserRole.FACILITY_ADMIN,
        priority: 0,
        createdBy: 'admin-1',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    error: null,
    actionId: null,
    refresh: mockRefresh,
    createAssignment: mockCreateAssignment,
    updateAssignment: mockUpdateAssignment,
    deleteAssignment: mockDeleteAssignment,
  }),
}));

function renderRules(templates = [
  { id: 'tpl-1', name: 'Staff Layout', description: null, pageCount: 1, widgetCount: 2, createdBy: 'user-1', updatedAt: '' },
  { id: 'tpl-2', name: 'Ops Layout', description: null, pageCount: 1, widgetCount: 3, createdBy: 'user-1', updatedAt: '' },
]) {
  return render(
    <MemoryRouter>
      <DashboardAssignmentRules templates={templates} templatesLoading={false} />
    </MemoryRouter>
  );
}

describe('DashboardAssignmentRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateAssignment.mockResolvedValue(true);
  });

  it('opens edit panel and saves template/priority changes', async () => {
    renderRules();

    fireEvent.click(screen.getByTitle('Edit rule'));

    expect(await screen.findByText('Edit assignment rule')).toBeInTheDocument();
    expect(screen.getByText(/Scope and target are fixed/)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Staff Layout'), {
      target: { value: 'tpl-2' },
    });
    fireEvent.change(screen.getByDisplayValue('0'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockUpdateAssignment).toHaveBeenCalledWith('assign-1', {
        savedDashboardId: 'tpl-2',
        priority: 5,
      });
    });
  });

  it('shows guidance when no templates exist', () => {
    renderRules([]);

    expect(screen.getByText(/Create a template first/)).toBeInTheDocument();
  });
});
