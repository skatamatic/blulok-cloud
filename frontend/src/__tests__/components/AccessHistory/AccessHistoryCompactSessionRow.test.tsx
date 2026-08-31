/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AccessHistoryCompactSessionRow } from '@/components/AccessHistory/AccessHistoryCompactSessionRow';
import { AccessSession } from '@/types/access-session.types';

jest.mock('framer-motion', () => ({
  motion: {
    li: ({ children, ...props }: React.PropsWithChildren<object>) => <li {...props}>{children}</li>,
  },
}));

function baseSession(overrides: Partial<AccessSession> = {}): AccessSession {
  return {
    id: 's1',
    kind: 'access',
    origin: 'on_site',
    method: 'mobile_key',
    outcome: 'granted',
    state: 'closed',
    device_id: 'd1',
    device_type: 'blulok',
    attempt_count: 1,
    started_at: '2026-08-07T18:00:00.000Z',
    closed_at: '2026-08-07T18:01:00.000Z',
    open_duration_sec: 60,
    user_name: 'Lawana Wyman',
    ...overrides,
  };
}

describe('AccessHistoryCompactSessionRow', () => {
  it('renders session title, user, and closed outcome (no timeline expand)', () => {
    const { container } = render(
      <ul>
        <AccessHistoryCompactSessionRow index={0} session={baseSession()} />
      </ul>,
    );

    expect(screen.getByText(/Mobile key/i)).toBeInTheDocument();
    expect(screen.getByText('Lawana Wyman')).toBeInTheDocument();
    expect(screen.getByText(/Closed/i)).toBeInTheDocument();
    expect(container.querySelector('[aria-expanded]')).toBeNull();
  });

  it('shows live open status for an open session', () => {
    render(
      <ul>
        <AccessHistoryCompactSessionRow
          index={0}
          session={baseSession({
            state: 'open',
            opened_at: new Date(Date.now() - 45_000).toISOString(),
            closed_at: undefined,
            open_duration_sec: undefined,
          })}
        />
      </ul>,
    );

    expect(screen.getByText(/Open now/i)).toBeInTheDocument();
  });
});
