import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionRoleBadge } from '../../src/renderer/components/SessionRoleBadge';
import { ConnectionStatus } from '../../src/renderer/components/ConnectionStatus';
import { ReconnectIndicator } from '../../src/renderer/components/ReconnectIndicator';
import { AppStartupSplash } from '../../src/renderer/components/AppStartupSplash';
import { sampleGateway } from './test-utils';

describe('SessionRoleBadge', () => {
  it('renders swap candidate pill variant', () => {
    render(
      <SessionRoleBadge
        connectionStatus="connected"
        sessionRole="swap_candidate"
        variant="pill"
      />,
    );
    expect(screen.getByText(/Swap candidate/i)).toBeInTheDocument();
  });

  it('renders compact offline badge', () => {
    render(<SessionRoleBadge connectionStatus="disconnected" compact />);
    expect(screen.getByText(/Offline/i)).toBeInTheDocument();
  });
});

describe('ConnectionStatus', () => {
  it('shows session role and warning banner when connected as swap candidate', () => {
    render(
      <ConnectionStatus
        gateway={sampleGateway({
          connectionStatus: 'connected',
          sessionRole: 'swap_candidate',
          connectionWarning: 'Inventory sync blocked during recovery.',
        })}
      />,
    );

    expect(screen.getByText(/Inventory sync blocked during recovery/i)).toBeInTheDocument();
    expect(screen.getByText(/cloud-gw-1/)).toBeInTheDocument();
    expect(screen.getAllByText(/Swap candidate/i).length).toBeGreaterThan(0);
  });

  it('shows last error when connection is in error state', () => {
    render(
      <ConnectionStatus
        gateway={sampleGateway({
          connectionStatus: 'error',
          lastError: 'WebSocket closed unexpectedly',
        })}
      />,
    );
    expect(screen.getByText(/WebSocket closed unexpectedly/i)).toBeInTheDocument();
  });
});

describe('ReconnectIndicator', () => {
  it('shows countdown while reconnect is scheduled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T12:00:00.000Z'));

    render(<ReconnectIndicator reconnectAt={Date.parse('2026-06-28T12:00:05.000Z')} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Reconnecting in/i);

    vi.useRealTimers();
  });

  it('renders nothing when reconnect is not scheduled', () => {
    const { container } = render(<ReconnectIndicator />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AppStartupSplash', () => {
  it('toggles visibility class and removes boot splash element', () => {
    document.body.innerHTML = '<div id="boot-splash"></div>';

    const { rerender } = render(<AppStartupSplash visible />);
    expect(document.querySelector('.app-startup-splash')).toHaveAttribute('aria-busy', 'true');
    expect(document.getElementById('boot-splash')).toBeNull();

    rerender(<AppStartupSplash visible={false} />);
    expect(document.querySelector('.app-startup-splash')).toHaveClass('app-startup-splash--hidden');
  });
});
