/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessHistoryTableRow } from '@/components/AccessHistory/AccessHistoryTableRow';
import type { AccessLog } from '@/types/access-history.types';

jest.mock('@/components/AccessHistory/AccessLogExpandedDetails', () => ({
  AccessLogExpandedDetails: jest.fn(({ log }) => (
    <div data-testid="expanded-details">Expanded details for {log.id}</div>
  )),
}));

describe('AccessHistoryTableRow', () => {
  const baseLog: AccessLog = {
    id: 'log-1',
    device_id: 'dev-1',
    device_type: 'blulok',
    facility_id: 'fac-1',
    unit_id: 'unit-1',
    action: 'unlock',
    method: 'admin_remote',
    success: true,
    occurred_at: '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    facility_name: 'Test Facility',
    unit_number: 'A-101',
    user_name: 'Jane Admin',
    user_id: 'user-1',
    metadata: {
      facility: { id: 'fac-1', name: 'Test Facility', navigation_url: '/facilities/fac-1' },
      unit: { id: 'unit-1', number: 'A-101', navigation_url: '/units/unit-1' },
      user: { id: 'user-1', name: 'Jane Admin', navigation_url: '/users/user-1/details' },
    },
  };

  const defaultProps = {
    log: baseLog,
    isExpanded: false,
    hideFacility: false,
    onToggle: jest.fn(),
    onNavigate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders occupied unit override badge when metadata is present', () => {
    const overrideLog: AccessLog = {
      ...baseLog,
      metadata: {
        ...baseLog.metadata,
        occupied_unit_override: true,
        tenant_unlock_override: {
          reason: 'emergency',
          reason_label: 'Emergency (Fire, flood, other)',
        },
      },
    };

    render(
      <table>
        <tbody>
          <AccessHistoryTableRow {...defaultProps} log={overrideLog} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('Override')).toBeInTheDocument();
  });

  it('renders override subtitle text when occupied_unit_override is present', () => {
    const overrideLog: AccessLog = {
      ...baseLog,
      metadata: {
        ...baseLog.metadata,
        occupied_unit_override: true,
        tenant_unlock_override: {
          reason: 'emergency',
          reason_label: 'Emergency (Fire, flood, other)',
        },
      },
    };

    render(
      <table>
        <tbody>
          <AccessHistoryTableRow {...defaultProps} log={overrideLog} />
        </tbody>
      </table>,
    );

    expect(screen.getByText(/Emergency \(Fire, flood, other\)/i)).toBeInTheDocument();
  });

  it('toggles expanded details when row is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();

    render(
      <table>
        <tbody>
          <AccessHistoryTableRow {...defaultProps} onToggle={onToggle} />
        </tbody>
      </table>,
    );

    const row = screen.getByRole('row');
    await user.click(row);

    expect(onToggle).toHaveBeenCalledWith('log-1');
  });

  it('renders expanded details when isExpanded is true', () => {
    render(
      <table>
        <tbody>
          <AccessHistoryTableRow {...defaultProps} isExpanded={true} />
        </tbody>
      </table>,
    );

    expect(screen.getByTestId('expanded-details')).toBeInTheDocument();
    expect(screen.getByText('Expanded details for log-1')).toBeInTheDocument();
  });

  it('does not render expanded details when isExpanded is false', () => {
    render(
      <table>
        <tbody>
          <AccessHistoryTableRow {...defaultProps} isExpanded={false} />
        </tbody>
      </table>,
    );

    expect(screen.queryByTestId('expanded-details')).not.toBeInTheDocument();
  });

  it('applies amber styling for occupied override rows', () => {
    const overrideLog: AccessLog = {
      ...baseLog,
      metadata: {
        ...baseLog.metadata,
        occupied_unit_override: true,
        tenant_unlock_override: {
          reason: 'testing_maintenance',
          reason_label: 'Testing and/or Maintenance',
        },
      },
    };

    const { container } = render(
      <table>
        <tbody>
          <AccessHistoryTableRow {...defaultProps} log={overrideLog} />
        </tbody>
      </table>,
    );

    const row = container.querySelector('tr');
    expect(row).toHaveClass('border-amber-700');
  });
});
