import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeviceDetailNav } from '../../src/renderer/components/device-detail/DeviceDetailNav';

describe('DeviceDetailNav', () => {
  it('renders only visible tabs and switches active tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DeviceDetailNav active="overview" visibleTabs={['overview', 'security', 'activity']} onChange={onChange} />,
    );

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Simulate' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Security' }));
    expect(onChange).toHaveBeenCalledWith('security');
  });
});
