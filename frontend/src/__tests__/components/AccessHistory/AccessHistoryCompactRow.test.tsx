/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AccessHistoryCompactRow } from '@/components/AccessHistory/AccessHistoryCompactRow';

jest.mock('framer-motion', () => ({
  motion: {
    li: ({ children, ...props }: React.PropsWithChildren<object>) => <li {...props}>{children}</li>,
  },
}));

describe('AccessHistoryCompactRow', () => {
  it('renders action and user for a successful unlock', () => {
    render(
      <ul>
        <AccessHistoryCompactRow
          index={0}
          log={{
            id: '1',
            action: 'unlock',
            method: 'app',
            success: true,
            user_name: 'Alex Tenant',
            occurred_at: '2026-06-01T12:00:00.000Z',
          }}
        />
      </ul>,
    );

    expect(screen.getByText(/unlock/i)).toBeInTheDocument();
    expect(screen.getByText('Alex Tenant')).toBeInTheDocument();
  });

  it('falls back to method when user is missing', () => {
    render(
      <ul>
        <AccessHistoryCompactRow
          index={0}
          log={{
            id: '2',
            action: 'access_denied',
            method: 'keypad',
            success: false,
            occurred_at: '2026-06-01T12:00:00.000Z',
          }}
        />
      </ul>,
    );

    expect(screen.getByText(/keypad/i)).toBeInTheDocument();
  });

  it('treats result success as succeeded when success boolean is absent', () => {
    const { container } = render(
      <ul>
        <AccessHistoryCompactRow
          index={0}
          log={{
            id: '3',
            action: 'lock',
            method: 'local_device',
            result: 'success',
            created_at: '2026-06-01T12:00:00.000Z',
          }}
        />
      </ul>,
    );

    expect(container.querySelector('.bg-emerald-500')).toBeTruthy();
    expect(container.querySelector('.bg-rose-500')).toBeFalsy();
  });

  it('uses created_at when occurred_at is missing and sets a title on the timestamp', () => {
    render(
      <ul>
        <AccessHistoryCompactRow
          index={0}
          log={{
            id: '4',
            action: 'unlock',
            method: 'app',
            success: true,
            user_name: 'Sam',
            created_at: '2026-06-01T12:00:00.000Z',
          }}
        />
      </ul>,
    );

    const timed = screen.getByTitle(/.+/);
    expect(timed).toBeInTheDocument();
  });
});
