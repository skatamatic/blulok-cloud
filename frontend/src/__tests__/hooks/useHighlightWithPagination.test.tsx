/**
 * @jest-environment jsdom
 */
import React, { useCallback } from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useHighlightWithPagination } from '@/hooks/useHighlightWithPagination';

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));

function createWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}

describe('useHighlightWithPagination', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Element.prototype.scrollIntoView = jest.fn() as unknown as typeof Element.prototype.scrollIntoView;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does nothing when highlight id is not in the dataset', () => {
    const onPageChange = jest.fn();
    const getEl = jest.spyOn(document, 'getElementById');

    renderHook(
      () => {
        const gen = useCallback((id: string) => `box-${id}`, []);
        useHighlightWithPagination(
          makeItems(5),
          (item) => item.id,
          gen,
          1,
          20,
          onPageChange
        );
      },
      { wrapper: createWrapper('/list?highlight=missing') }
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(onPageChange).not.toHaveBeenCalled();
    expect(getEl).not.toHaveBeenCalled();
  });

  it('highlights on the current page without changing page', () => {
    const onPageChange = jest.fn();
    const el = document.createElement('div');
    el.id = 'box-id-3';
    document.body.appendChild(el);

    renderHook(
      () => {
        const gen = useCallback((id: string) => `box-${id}`, []);
        useHighlightWithPagination(
          makeItems(10),
          (item) => item.id,
          gen,
          1,
          20,
          onPageChange
        );
      },
      { wrapper: createWrapper('/list?highlight=id-3') }
    );

    act(() => {
      jest.runAllTimers();
    });

    expect(onPageChange).not.toHaveBeenCalled();
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it('navigates to the target page then highlights', () => {
    const onPageChange = jest.fn();
    // id-21 is index 21 -> page 2 when itemsPerPage is 20
    const el = document.createElement('div');
    el.id = 'box-id-21';
    document.body.appendChild(el);

    const { rerender } = renderHook(
      ({ page }: { page: number }) => {
        const gen = useCallback((id: string) => `box-${id}`, []);
        useHighlightWithPagination(
          makeItems(40),
          (item) => item.id,
          gen,
          page,
          20,
          onPageChange
        );
      },
      {
        wrapper: createWrapper('/list?highlight=id-21'),
        initialProps: { page: 1 },
      }
    );

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(onPageChange).toHaveBeenCalledWith(2);

    act(() => {
      rerender({ page: 2 });
    });

    act(() => {
      jest.runAllTimers();
    });

    expect(el.scrollIntoView).toHaveBeenCalled();
  });

});
