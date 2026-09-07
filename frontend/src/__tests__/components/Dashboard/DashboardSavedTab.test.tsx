/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardSavedTab, DashboardSavedTabProps } from '@/components/Dashboard/DashboardSavedTab';
import { SavedDashboardListItem } from '@/hooks/useSavedDashboards';

jest.mock('@/utils/datetime.utils', () => ({
  formatDateTime: (value: string) => `fmt:${value}`,
}));

const sampleItem: SavedDashboardListItem = {
  id: 'dash-1',
  name: 'Ops Layout',
  description: 'Daily ops view',
  pageCount: 2,
  widgetCount: 5,
  createdBy: 'u1',
  createdByEmail: 'admin@example.com',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderTab(overrides: Partial<DashboardSavedTabProps> = {}) {
  const props = {
    dashboards: [sampleItem],
    isLoading: false,
    error: null as string | null,
    isSaving: false,
    actionId: null as string | null,
    onRefresh: jest.fn(),
    onSaveCurrent: jest.fn().mockResolvedValue(true),
    onUpdateExisting: jest.fn().mockResolvedValue(true),
    suggestedUpdateTemplateId: 'dash-1',
    onLoad: jest.fn().mockResolvedValue(true),
    onRename: jest.fn().mockResolvedValue(true),
    onDelete: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  const view = render(<DashboardSavedTab {...props} />);
  return { ...view, props };
}

describe('DashboardSavedTab', () => {
  it('shows empty state when there are no dashboards', () => {
    renderTab({ dashboards: [] });
    expect(screen.getByText(/No saved dashboards yet/i)).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    renderTab({ dashboards: [], isLoading: true, error: 'Could not load' });
    expect(screen.getByText(/Loading saved dashboards/i)).toBeInTheDocument();
    expect(screen.getByText('Could not load')).toBeInTheDocument();
  });

  it('saves current dashboard from the form', async () => {
    const { props } = renderTab();

    fireEvent.change(screen.getByPlaceholderText('Operations overview'), {
      target: { value: ' Night shift ' },
    });
    fireEvent.change(screen.getByPlaceholderText('Brief note for other admins'), {
      target: { value: ' after hours ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save current dashboard/i }));

    await waitFor(() => {
      expect(props.onSaveCurrent).toHaveBeenCalledWith('Night shift', 'after hours');
    });
  });

  it('refreshes library and lists assigned badge', () => {
    const { props } = renderTab();
    expect(screen.getByText('Ops Layout')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
    expect(screen.getByText(/2 pages · 5 widgets/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('confirms load and delete actions', async () => {
    const { props } = renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByText('Load saved dashboard?')).toBeInTheDocument();
    const loadButtons = screen.getAllByRole('button', { name: 'Load' });
    fireEvent.click(loadButtons[loadButtons.length - 1]);

    await waitFor(() => {
      expect(props.onLoad).toHaveBeenCalledWith('dash-1');
    });

    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText('Delete saved dashboard?')).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(props.onDelete).toHaveBeenCalledWith('dash-1');
    });
  });

  it('confirms update from current', async () => {
    const { props } = renderTab();

    fireEvent.click(screen.getByRole('button', { name: /Update from current/i }));
    expect(screen.getByText('Update from current?')).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: 'Update from current' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(props.onUpdateExisting).toHaveBeenCalledWith('dash-1');
    });
  });

  it('renames a dashboard row', async () => {
    const { props } = renderTab();

    fireEvent.click(screen.getByTitle('Rename'));
    const nameInput = screen.getByDisplayValue('Ops Layout');
    fireEvent.change(nameInput, { target: { value: 'Ops v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(props.onRename).toHaveBeenCalledWith('dash-1', 'Ops v2', 'Daily ops view');
    });
  });

  it('cancels rename without calling onRename', () => {
    const { props } = renderTab();

    fireEvent.click(screen.getByTitle('Rename'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Ops Layout')).toBeInTheDocument();
    expect(props.onRename).not.toHaveBeenCalled();
  });

  it('hides save form and load action when requested', () => {
    renderTab({ hideSaveForm: true, hideLoadAction: true, onUpdateExisting: undefined });

    expect(screen.queryByRole('button', { name: /Save current dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Update from current/i })).not.toBeInTheDocument();
  });
});
