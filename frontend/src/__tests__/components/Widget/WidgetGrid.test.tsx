/**
 * @jest-environment jsdom
 */
import { useEffect, type ReactNode } from 'react';
import { render, act } from '@testing-library/react';
import { WidgetGrid } from '@/components/Widget/WidgetGrid';

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

let lastGridProps: Record<string, unknown> | null = null;

jest.mock('react-grid-layout', () => {
  const Responsive = (props: Record<string, unknown>) => {
    lastGridProps = props;
    useEffect(() => {
      const item = { i: 'w1', x: 0, y: 0, w: 3, h: 2 };
      const layoutsPayload = { lg: [item], md: [item], sm: [item] };
      const onLayoutChange = props.onLayoutChange as
        | ((layout: unknown[], layouts: typeof layoutsPayload) => void)
        | undefined;
      const onDragStop = props.onDragStop as
        | ((layout: unknown[]) => void)
        | undefined;
      const onResize = props.onResize as
        | ((layout: unknown[], layouts: typeof layoutsPayload, resizingItem: unknown) => void)
        | undefined;
      // RGL breakpoint/width mutations — must not commit to parent.
      onLayoutChange?.([{ ...item, x: 99 }], layoutsPayload);
      // User gesture — sole commit path.
      onDragStop?.([item]);
      onDragStop?.([item]);
      onResize?.([{ ...item, w: 4 }], layoutsPayload, { ...item, w: 4 });
    }, [props.onLayoutChange, props.onDragStop, props.onResize]);
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
    lastGridProps = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('locks react-grid-layout to the lg breakpoint (12-col preferred geometry)', async () => {
    const layouts = {
      lg: [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }],
      md: [],
      sm: [],
    };

    await act(async () => {
      render(
        <WidgetGrid layouts={layouts}>
          <div key="w1">A</div>
        </WidgetGrid>
      );
    });

    expect(lastGridProps?.breakpoint).toBe('lg');
  });

  it('does not commit RGL onLayoutChange; only drag/resize stop reaches the parent', async () => {
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

    expect(onLayoutChange).toHaveBeenCalledTimes(2);
    expect(onLayoutChange).toHaveBeenCalledWith(
      [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }],
      expect.objectContaining({ lg: expect.any(Array) })
    );
  });

  it('persists layouts to localStorage when persistToLocalStorage is enabled', async () => {
    const onLayoutChange = jest.fn();
    const layouts = {
      lg: [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }],
      md: [],
      sm: [],
    };

    await act(async () => {
      render(
        <WidgetGrid layouts={layouts} onLayoutChange={onLayoutChange} persistToLocalStorage>
          <div key="w1">A</div>
        </WidgetGrid>
      );
    });

    expect(onLayoutChange).toHaveBeenCalled();
    const stored = localStorage.getItem('blulok-widget-layouts');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toHaveProperty('lg');
  });

  it('does not persist to localStorage by default (v2 dashboard owns persistence)', async () => {
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
    expect(localStorage.getItem('blulok-widget-layouts')).toBeNull();
  });

  it('debounces onLayoutSave after drag/resize stop', async () => {
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

  it('rejects layout change when validateLivePlacement returns false', async () => {
    const onLayoutChange = jest.fn(() => false);
    const layouts = {
      lg: [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }],
      md: [],
      sm: [],
    };

    await act(async () => {
      render(
        <WidgetGrid
          layouts={layouts}
          onLayoutChange={onLayoutChange}
          validateLivePlacement={() => false}
        >
          <div key="w1">A</div>
        </WidgetGrid>
      );
    });

    expect(onLayoutChange).toHaveBeenCalled();
  });

  it('calls onResize during resize gestures', async () => {
    const onResize = jest.fn();
    const layouts = {
      lg: [{ i: 'w1', x: 0, y: 0, w: 3, h: 2 }],
      md: [],
      sm: [],
    };

    await act(async () => {
      render(
        <WidgetGrid layouts={layouts} onResize={onResize}>
          <div key="w1">A</div>
        </WidgetGrid>
      );
    });

    expect(onResize).toHaveBeenCalled();
  });
});
