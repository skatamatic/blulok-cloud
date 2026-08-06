/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessHistoryFilters,
  type AccessHistoryFilterState,
} from '@/components/AccessHistory/AccessHistoryFilters';
import { ThemeProvider } from '@/contexts/ThemeContext';

jest.mock('@/components/Common/UnitFilter', () => ({
  UnitFilter: jest.fn(({ onChange, placeholder }) => (
    <input
      data-testid="unit-filter"
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('AccessHistoryFilters', () => {
  const defaultFilters: AccessHistoryFilterState = {
    limit: 50,
  };

  const defaultProps = {
    filters: defaultFilters,
    filtersExpanded: true,
    isCustomDateRange: false,
    onFilterChange: jest.fn(),
    onToggleNeedsAttention: jest.fn(),
    onToggleExpanded: jest.fn(),
    onClearFilters: jest.fn(),
    onSetCustomDateRange: jest.fn(),
    onSetUnitFilterLabel: jest.fn(),
    onSetUserFilterLabel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders filter sections when expanded', () => {
    renderWithTheme(<AccessHistoryFilters {...defaultProps} />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Date Range')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Method')).toBeInTheDocument();
  });

  it('shows Needs attention chip and hides Raw events by default', () => {
    renderWithTheme(<AccessHistoryFilters {...defaultProps} currentlyOpenCount={2} />);
    expect(screen.getByRole('button', { name: /needs attention/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /raw events/i })).not.toBeInTheDocument();
  });

  it('shows Raw events only when canViewRaw is true', () => {
    renderWithTheme(
      <AccessHistoryFilters {...defaultProps} canViewRaw currentlyOpenCount={0} />,
    );
    expect(screen.getByRole('button', { name: /raw events/i })).toBeInTheDocument();
  });

  it('includes Remote Access Granted in Action filter', () => {
    renderWithTheme(<AccessHistoryFilters {...defaultProps} />);
    
    const actionSection = screen.getByText('Action').closest('div')?.parentElement;
    expect(actionSection).toBeTruthy();
    expect(actionSection?.textContent).toContain('Remote Access Granted');
  });

  it('calls onClearFilters when clear button is clicked with active filters', async () => {
    const user = userEvent.setup();
    const onClearFilters = jest.fn();
    const filtersWithActive: AccessHistoryFilterState = {
      ...defaultFilters,
      search: 'test search',
      action: 'unlock',
    };

    renderWithTheme(
      <AccessHistoryFilters
        {...defaultProps}
        filters={filtersWithActive}
        onClearFilters={onClearFilters}
      />,
    );

    const clearButton = screen.getByRole('button', { name: /clear/i });
    await user.click(clearButton);

    expect(onClearFilters).toHaveBeenCalled();
  });

  it('does not show clear button when no active filters', () => {
    renderWithTheme(<AccessHistoryFilters {...defaultProps} />);
    
    const clearButton = screen.queryByRole('button', { name: /clear/i });
    expect(clearButton).not.toBeInTheDocument();
  });

  it('renders UnitFilter component with correct props', () => {
    const selectedFacilityId = 'fac-123';
    renderWithTheme(
      <AccessHistoryFilters {...defaultProps} selectedFacilityId={selectedFacilityId} />,
    );

    const unitFilter = screen.getByTestId('unit-filter');
    expect(unitFilter).toBeInTheDocument();
    expect(unitFilter).toHaveAttribute('placeholder', 'Search units...');
  });
});
