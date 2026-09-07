/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  StatKpiContent,
  StatTinyContent,
  statTinyLabel,
} from '@/components/Widget/widget-content.utils';
import { DashboardFacilityScopePlaceholder } from '@/components/Widget/DashboardFacilityScopePlaceholder';
import {
  DASHBOARD_SELECT_FACILITY_MESSAGE,
  DASHBOARD_SELECT_FACILITY_TITLE,
} from '@/constants/dashboard-facility-scope.constants';

const Icon = ({ className }: { className?: string }) => (
  <svg data-testid="tile-icon" className={className} />
);

describe('statTinyLabel', () => {
  it('maps known titles to short labels', () => {
    expect(statTinyLabel('Facilities Count')).toBe('Facilities');
    expect(statTinyLabel('Active Devices')).toBe('Devices');
    expect(statTinyLabel('Unread Alert Notifications')).toBe('Alerts');
  });

  it('shortens generic titles', () => {
    expect(statTinyLabel('  Units  ')).toBe('Units');
    expect(statTinyLabel('Battery Health Count')).toBe('Battery Health');
    expect(statTinyLabel('Open Gate Status')).toBe('Open Gate');
    expect(statTinyLabel('')).toBe('');
  });
});

describe('StatTinyContent', () => {
  it('renders value, icon, and shortened label', () => {
    render(
      <StatTinyContent
        icon={Icon}
        value={42}
        label="Active Devices"
        iconClassName="text-blue-500"
      />,
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Devices')).toBeInTheDocument();
    expect(screen.getByTestId('tile-icon')).toBeInTheDocument();
  });

  it('shows loading spinner instead of value', () => {
    render(
      <StatTinyContent
        icon={Icon}
        value={0}
        label="Facilities Count"
        iconClassName="text-blue-500"
        loading
      />,
    );

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('uses smaller type for longer numeric displays', () => {
    const { rerender } = render(
      <StatTinyContent
        icon={Icon}
        value={123}
        label="Users"
        iconClassName="bg"
      />,
    );
    expect(screen.getByText('123').className).toContain('text-lg');

    rerender(
      <StatTinyContent
        icon={Icon}
        value={12345}
        label="Users"
        iconClassName="bg"
      />,
    );
    expect(screen.getByText('12345').className).toContain('text-base');
  });
});

describe('StatKpiContent', () => {
  it('renders KPI value for small size', () => {
    render(
      <StatKpiContent
        icon={Icon}
        value={7}
        iconClassName="bg-blue-100"
        size="small"
      />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByTestId('tile-icon')).toHaveAttribute('class', expect.stringContaining('h-5'));
  });

  it('uses larger icon/value classes for huge size', () => {
    render(
      <StatKpiContent
        icon={Icon}
        value={99}
        iconClassName="bg-blue-100"
        size="huge"
      />,
    );
    expect(screen.getByText('99').parentElement?.className).toMatch(/text-4xl/);
    expect(screen.getByTestId('tile-icon')).toHaveAttribute('class', expect.stringContaining('h-8'));
  });
});

describe('DashboardFacilityScopePlaceholder', () => {
  it('renders default facility-scope copy', () => {
    render(<DashboardFacilityScopePlaceholder />);
    expect(screen.getByText(DASHBOARD_SELECT_FACILITY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(DASHBOARD_SELECT_FACILITY_MESSAGE)).toBeInTheDocument();
  });

  it('allows custom title and message', () => {
    render(
      <DashboardFacilityScopePlaceholder
        title="Pick a site"
        message="Gates need a facility."
      />,
    );
    expect(screen.getByText('Pick a site')).toBeInTheDocument();
    expect(screen.getByText('Gates need a facility.')).toBeInTheDocument();
  });
});
