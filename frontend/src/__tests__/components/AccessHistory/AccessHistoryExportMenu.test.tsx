/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessHistoryExportMenu } from '@/components/AccessHistory/AccessHistoryExportMenu';
import { ThemeProvider } from '@/contexts/ThemeContext';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('AccessHistoryExportMenu', () => {
  const defaultProps = {
    loading: false,
    open: false,
    onOpenChange: jest.fn(),
    onExport: jest.fn(),
    dropdownRef: { current: null } as React.RefObject<HTMLDivElement>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders export button', () => {
    renderWithTheme(<AccessHistoryExportMenu {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
  });

  it('shows menu when open is true', () => {
    renderWithTheme(<AccessHistoryExportMenu {...defaultProps} open={true} />);
    expect(screen.getByText('Export Current Filter')).toBeInTheDocument();
    expect(screen.getByText('Export All Data')).toBeInTheDocument();
  });

  it('calls onExport with "filtered" when Export Current Filter is clicked', async () => {
    const user = userEvent.setup();
    const onExport = jest.fn();

    renderWithTheme(
      <AccessHistoryExportMenu {...defaultProps} open={true} onExport={onExport} />,
    );

    await user.click(screen.getByText('Export Current Filter'));
    expect(onExport).toHaveBeenCalledWith('filtered');
  });

  it('calls onExport with "all" when Export All Data is clicked', async () => {
    const user = userEvent.setup();
    const onExport = jest.fn();

    renderWithTheme(
      <AccessHistoryExportMenu {...defaultProps} open={true} onExport={onExport} />,
    );

    await user.click(screen.getByText('Export All Data'));
    expect(onExport).toHaveBeenCalledWith('all');
  });

  it('disables button when loading', () => {
    renderWithTheme(<AccessHistoryExportMenu {...defaultProps} loading={true} />);
    expect(screen.getByRole('button', { name: /Exporting.../i })).toBeDisabled();
  });

  it('shows loading spinner when loading', () => {
    renderWithTheme(<AccessHistoryExportMenu {...defaultProps} loading={true} />);
    expect(screen.getByText('Exporting...')).toBeInTheDocument();
  });

  it('calls onOpenChange when main button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();

    renderWithTheme(
      <AccessHistoryExportMenu {...defaultProps} onOpenChange={onOpenChange} />,
    );

    await user.click(screen.getByRole('button', { name: /Export/i }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
