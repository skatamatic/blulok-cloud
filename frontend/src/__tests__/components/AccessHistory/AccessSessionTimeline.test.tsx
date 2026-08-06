import { AccessSessionTimeline } from '@/components/AccessHistory/AccessSessionTimeline';
import { AccessSession } from '@/types/access-session.types';
import { render, screen } from '@testing-library/react';
import {
  buildAccessSessionTimelineSteps,
  isRemoteCommandSession,
} from '@/utils/access-session-timeline.utils';

jest.mock('@/utils/datetime.utils', () => ({
  formatDateTime: (value: string) => `fmt:${value}`,
  parseInstant: (value?: string) => (value ? new Date(value) : null),
}));

function baseSession(overrides: Partial<AccessSession> = {}): AccessSession {
  return {
    id: 's1',
    kind: 'access',
    origin: 'cloud_remote',
    method: 'admin_remote',
    outcome: 'granted',
    state: 'closed',
    device_id: 'd1',
    device_type: 'blulok',
    attempt_count: 1,
    started_at: '2026-08-05T04:00:00.000Z',
    opened_at: '2026-08-05T04:00:10.000Z',
    closed_at: '2026-08-05T04:04:22.000Z',
    user_name: 'Alex Rivera',
    ...overrides,
  };
}

describe('isRemoteCommandSession', () => {
  it('treats cloud remote as remote', () => {
    expect(isRemoteCommandSession(baseSession())).toBe(true);
  });

  it('treats keypad/app as instant', () => {
    expect(isRemoteCommandSession(baseSession({ origin: 'on_site', method: 'keypad' }))).toBe(false);
    expect(isRemoteCommandSession(baseSession({ origin: 'on_site', method: 'app' }))).toBe(false);
  });
});

describe('buildAccessSessionTimelineSteps', () => {
  it('collapses keypad success to Unlocked → Locked', () => {
    const steps = buildAccessSessionTimelineSteps(
      baseSession({
        origin: 'on_site',
        method: 'keypad',
        user_name: undefined,
      }),
    );
    expect(steps.map((s) => s.id)).toEqual(['unlocked', 'locked']);
    expect(steps[0].title).toBe('Unlocked');
    expect(steps[0].icon).toBe('opened');
    expect(steps[0].detail).toMatch(/via keypad/i);
    expect(steps[1].icon).toBe('locked');
  });

  it('collapses app denial to a single Denied step', () => {
    const steps = buildAccessSessionTimelineSteps(
      baseSession({
        origin: 'on_site',
        method: 'app',
        state: 'denied',
        outcome: 'denied',
        denial_reason: 'invalid_credential',
        opened_at: undefined,
        closed_at: undefined,
        settled_at: '2026-08-05T04:00:01.000Z',
      }),
    );
    expect(steps.map((s) => s.id)).toEqual(['denied']);
    expect(steps[0].icon).toBe('denied');
  });

  it('keeps remote Requested → Opened → Locked', () => {
    const steps = buildAccessSessionTimelineSteps(baseSession());
    expect(steps.map((s) => s.id)).toEqual(['requested', 'opened', 'locked']);
    expect(steps.map((s) => s.icon)).toEqual(['requested', 'opened', 'locked']);
  });

  it('keeps remote Requested → Timed out', () => {
    const steps = buildAccessSessionTimelineSteps(
      baseSession({
        state: 'timed_out',
        outcome: 'failed',
        opened_at: undefined,
        closed_at: undefined,
        settled_at: '2026-08-05T04:01:00.000Z',
        reason: 'Timed out waiting for device confirmation',
      }),
    );
    expect(steps.map((s) => s.id)).toEqual(['requested', 'timed_out']);
    expect(steps[1].icon).toBe('timed_out');
  });
});

describe('AccessSessionTimeline', () => {
  it('renders Requested → Opened → Locked for cloud remote', () => {
    render(
      <AccessSessionTimeline
        session={baseSession()}
        events={[{ id: 'act-1' } as any]}
      />,
    );

    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.getByText(/by Alex Rivera/)).toBeInTheDocument();
    expect(screen.queryByText('Granted')).not.toBeInTheDocument();
    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('renders Unlocked → Locked for keypad (no Requested/Granted/Opened)', () => {
    render(
      <AccessSessionTimeline
        session={baseSession({
          origin: 'on_site',
          method: 'keypad',
          user_name: undefined,
        })}
      />,
    );

    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.getByText(/via keypad/i)).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.queryByText('Requested')).not.toBeInTheDocument();
    expect(screen.queryByText('Granted')).not.toBeInTheDocument();
    expect(screen.queryByText('Opened')).not.toBeInTheDocument();
  });

  it('renders single Denied for on-site denial', () => {
    render(
      <AccessSessionTimeline
        session={baseSession({
          origin: 'on_site',
          method: 'app',
          state: 'denied',
          outcome: 'denied',
          denial_reason: 'invalid_credential',
          opened_at: undefined,
          closed_at: undefined,
          settled_at: '2026-08-05T04:00:01.000Z',
        })}
      />,
    );

    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText(/Invalid credential/i)).toBeInTheDocument();
    expect(screen.queryByText('Requested')).not.toBeInTheDocument();
    expect(screen.queryByText('Opened')).not.toBeInTheDocument();
  });

  it('shows waiting spinner while remote pending', () => {
    const { container } = render(
      <AccessSessionTimeline
        session={baseSession({
          state: 'pending',
          opened_at: undefined,
          closed_at: undefined,
          expires_at: '2026-08-05T04:01:00.000Z',
        })}
      />,
    );

    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.getByText(/Waiting for device to unlock/i)).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows Requested → Timed out for remote timeout', () => {
    render(
      <AccessSessionTimeline
        session={baseSession({
          state: 'timed_out',
          outcome: 'failed',
          opened_at: undefined,
          closed_at: undefined,
          settled_at: '2026-08-05T04:01:00.000Z',
          reason: 'Timed out waiting for device confirmation',
        })}
      />,
    );

    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.getByText('Timed out')).toBeInTheDocument();
    expect(screen.getByText(/Timed out waiting for device confirmation/i)).toBeInTheDocument();
  });
});
