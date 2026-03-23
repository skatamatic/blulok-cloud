/**
 * @jest-environment jsdom
 */
import { useEffect, type ReactNode } from 'react';
import { render, act } from '@testing-library/react';
import { WidgetGrid } from '@/components/Widget/WidgetGrid';

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('react-grid-layout', () => {
  const Responsive = (props: Record<string, unknown>) => {
    useEffect(() => {
      const item = { i: 'w1', x: 0, y: 0, w: 3, h: 2 };
      const layoutsPayload = { lg: [item], md: [item], sm: [item] };
      const onLayoutChange = props.onLayoutChange as
        | ((layout: unknown[], layouts: typeof layoutsPayload) => void)
        | undefined;
      // First call: initial load — skips debounced save; second call schedules onLayoutSave.
      onLayoutChange?.([item], layoutsPayload);
      onLayoutChange?.([item], layoutsPayload);
    }, [props.onLayoutChange]);
    return <div data-testid="mock-responsive">{props.children as ReactNode}</div>;
  };
  const WidthProvider = (Wrapped: import('react').ComponentType<Record<string, unknown>>) => {
    return function WithWidth(p: Record<string, unknown>) {
      return <Wrapped {...p} />;
    };
  };
  return { Responsive, WidthProvider };
});

describe('WidgetGrid', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists layouts to localStorage when layout changes', async () => {
    const onLayoutChange = jest.fn();
    const layouts = {
      lg: [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }],
      md: [],
      sm: [],
    };

    await act(async () => {
      render(
        <WidgetGrid layouts={layouts} onLayoutChange={onLayoutChange}>
          <div key="w1">A</div>
        </WidgetGrid>
      );
    });

    expect(onLayoutChange).toHaveBeenCalled();
    const stored = localStorage.getItem('blulok-widget-layouts');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toHaveProperty('lg');
  });

  it('debounces onLayoutSave after non-initial layout change', async () => {
    jest.useFakeTimers();
    const onLayoutSave = jest.fn();

    const layouts = {
      lg: [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }],
      md: [],
      sm: [],
    };

    await act(async () => {
      render(
        <WidgetGrid layouts={layouts} onLayoutSave={onLayoutSave}>
          <div key="w1">A</div>
        </WidgetGrid>
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(onLayoutSave).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('logs when lg layout is missing', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <WidgetGrid layouts={{ lg: [], md: [], sm: [] }}>
        <div key="x">x</div>
      </WidgetGrid>
    );
    expect(err).toHaveBeenCalledWith(expect.stringContaining('No lg layout'));
  });
});
