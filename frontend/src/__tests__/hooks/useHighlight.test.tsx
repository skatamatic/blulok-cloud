/**
 * @jest-environment jsdom
 */
import React, { useCallback } from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useHighlight } from '@/hooks/useHighlight';

function createWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}

describe('useHighlight', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Element.prototype.scrollIntoView = jest.fn() as unknown as typeof Element.prototype.scrollIntoView;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does nothing when there is no highlight query param', () => {
    const getEl = jest.spyOn(document, 'getElementById');

    renderHook(
      () => {
        const gen = useCallback((id: string) => `hl-${id}`, []);
        useHighlight([{ id: 'a' }], (x) => x.id, gen);
      },
      { wrapper: createWrapper('/page') }
    );

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getEl).not.toHaveBeenCalled();
  });

  it('does nothing when data is empty even with highlight param', () => {
    const getEl = jest.spyOn(document, 'getElementById');

    renderHook(
      () => {
        const gen = useCallback((id: string) => `hl-${id}`, []);
        useHighlight([], (x: { id: string }) => x.id, gen);
      },
      { wrapper: createWrapper('/page?highlight=item-1') }
    );

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getEl).not.toHaveBeenCalled();
  });

  it('scrolls and decorates the target element when it exists', () => {
    const el = document.createElement('div');
    el.id = 'hl-item-1';
    document.body.appendChild(el);

    renderHook(
      () => {
        const gen = useCallback((id: string) => `hl-${id}`, []);
        useHighlight([{ id: 'x' }], () => '', gen);
      },
      { wrapper: createWrapper('/u?highlight=item-1') }
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  });

  it('retries when the element appears after a delay', () => {
    const el = document.createElement('div');
    el.id = 'hl-late';
    let appended = false;

    jest.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id !== 'hl-late') return null;
      return appended ? el : null;
    });

    renderHook(
      () => {
        const gen = useCallback((id: string) => `hl-${id}`, []);
        useHighlight([{ id: '1' }], () => '', gen);
      },
      { wrapper: createWrapper('/p?highlight=late') }
    );

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(el.scrollIntoView).not.toHaveBeenCalled();

    appended = true;

    act(() => {
      jest.runAllTimers();
    });

    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it('clears the initial timer on unmount', () => {
    const el = document.createElement('div');
    el.id = 'hl-item-1';
    document.body.appendChild(el);

    const { unmount } = renderHook(
      () => {
        const gen = useCallback((id: string) => `hl-${id}`, []);
        useHighlight([{ id: 'x' }], () => '', gen);
      },
      { wrapper: createWrapper('/u?highlight=item-1') }
    );

    unmount();

    act(() => {
      jest.runAllTimers();
    });

    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });
});
