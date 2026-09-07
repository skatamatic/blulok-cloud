/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import { FMSSyncProvider, useFMSSync } from '@/contexts/FMSSyncContext';

const mockSubscribe = jest.fn(() => 'sub-1');
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

function Probe() {
  const ctx = useFMSSync();
  return (
    <div>
      <span data-testid="active">{String(ctx.syncState.isActive)}</span>
      <span data-testid="step">{ctx.syncState.currentStep}</span>
      <span data-testid="review">{String(ctx.syncState.showReviewModal)}</span>
      <span data-testid="progress">{String(ctx.syncState.progressPercentage)}</span>
      <span data-testid="changes">{String(ctx.syncState.pendingChanges.length)}</span>
      <button type="button" onClick={() => ctx.startSync('fac-1', 'Test Facility')}>
        start
      </button>
      <button type="button" onClick={() => ctx.updateStep('fetching')}>fetching</button>
      <button type="button" onClick={() => ctx.setProgress(55)}>progress</button>
      <button
        type="button"
        onClick={() =>
          ctx.completeSync(
            [
              {
                id: 'c1',
                sync_log_id: 's1',
                change_type: 'tenant_added' as never,
                entity_type: 'tenant',
                external_id: 'e1',
                after_data: {},
                required_actions: [],
                impact_summary: 'x',
                is_reviewed: false,
                created_at: '2026-01-01T00:00:00.000Z',
              },
            ],
            {
              success: true,
              syncLogId: 's1',
              summary: {
                tenantsAdded: 1,
                tenantsRemoved: 0,
                tenantsUpdated: 0,
                unitsAdded: 0,
                unitsRemoved: 0,
                unitsUpdated: 0,
                errors: [],
                warnings: [],
              },
            }
          )
        }
      >
        complete
      </button>
      <button type="button" onClick={() => ctx.cancelSync()}>cancel</button>
      <button type="button" onClick={() => ctx.minimizeSync()}>minimize</button>
      <button type="button" onClick={() => ctx.maximizeSync()}>maximize</button>
    </div>
  );
}

describe('FMSSyncContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts sync and subscribes to progress updates', () => {
    render(
      <FMSSyncProvider>
        <Probe />
      </FMSSyncProvider>
    );

    act(() => {
      screen.getByText('start').click();
    });

    expect(screen.getByTestId('active').textContent).toBe('true');
    expect(screen.getByTestId('step').textContent).toBe('connecting');
    expect(mockSubscribe).toHaveBeenCalledWith('fms_sync_progress', expect.any(Function));
  });

  it('prevents duplicate sync while in flight', () => {
    render(
      <FMSSyncProvider>
        <Probe />
      </FMSSyncProvider>
    );

    act(() => {
      screen.getByText('start').click();
      screen.getByText('start').click();
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  it('cancelSync clears active state', () => {
    render(
      <FMSSyncProvider>
        <Probe />
      </FMSSyncProvider>
    );

    act(() => {
      screen.getByText('start').click();
      screen.getByText('cancel').click();
    });

    expect(screen.getByTestId('active').textContent).toBe('false');
  });

  it('minimize and maximize toggle minimized flag', () => {
    render(
      <FMSSyncProvider>
        <Probe />
      </FMSSyncProvider>
    );

    act(() => {
      screen.getByText('start').click();
      screen.getByText('minimize').click();
    });

    act(() => {
      screen.getByText('maximize').click();
    });

    expect(screen.getByTestId('active').textContent).toBe('true');
  });

  it('updateStep and setProgress advance sync state', () => {
    render(
      <FMSSyncProvider>
        <Probe />
      </FMSSyncProvider>
    );

    act(() => {
      screen.getByText('start').click();
      screen.getByText('fetching').click();
    });

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByTestId('step').textContent).toBe('fetching');
    expect(screen.getByTestId('progress').textContent).toBe('40');

    act(() => {
      screen.getByText('progress').click();
    });
    expect(screen.getByTestId('progress').textContent).toBe('55');
  });

  it('completeSync marks complete and opens review when changes exist', () => {
    render(
      <FMSSyncProvider>
        <Probe />
      </FMSSyncProvider>
    );

    act(() => {
      screen.getByText('start').click();
      screen.getByText('complete').click();
    });

    expect(screen.getByTestId('step').textContent).toBe('complete');
    expect(screen.getByTestId('review').textContent).toBe('true');
    expect(screen.getByTestId('changes').textContent).toBe('1');
    expect(screen.getByTestId('progress').textContent).toBe('100');
  });
});
