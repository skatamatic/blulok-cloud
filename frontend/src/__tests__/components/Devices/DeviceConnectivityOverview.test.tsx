import { render, screen } from '@testing-library/react';
import { DeviceConnectivityOverview } from '@/components/Devices/DeviceConnectivityOverview';

describe('DeviceConnectivityOverview', () => {
  it('shows a single badge when reachability matches reported status', () => {
    render(
      <DeviceConnectivityOverview
        effectiveStatus="online"
        reportedStatus="online"
        statusUnreachableReason={null}
      />,
    );

    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.queryByText('Last reported')).not.toBeInTheDocument();
  });

  it('shows dual badges and gateway offline callout when coerced', () => {
    render(
      <DeviceConnectivityOverview
        effectiveStatus="offline"
        reportedStatus="online"
        statusUnreachableReason="gateway_offline"
      />,
    );

    expect(screen.getByText('Reachability')).toBeInTheDocument();
    expect(screen.getByText('Last reported')).toBeInTheDocument();
    expect(
      screen.getByText('Gateway offline — device unreachable'),
    ).toBeInTheDocument();
  });
});
