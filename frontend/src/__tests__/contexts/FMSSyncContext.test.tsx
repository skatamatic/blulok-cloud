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
      <button type="button" onClick={() => ctx.startSync('fac-1', 'Test Facility')}>
        start
      </button>
      <button type="button" onClick={() => ctx.updateStep('fetching')}>fetching</button>
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
});
