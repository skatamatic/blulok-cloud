/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useBackNavigation, withReturnPath, useDetailsBackNavigation } from '@/hooks/useBackNavigation';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: jest.fn(),
  };
});

const { useLocation } = jest.requireMock<typeof import('react-router-dom')>('react-router-dom');

describe('withReturnPath', () => {
  it('merges state with fromPath from pathname search and hash', () => {
    expect(
      withReturnPath(
        { pathname: '/a', search: '?x=1', hash: '#h', state: { prior: true } },
        { k: 2 },
      ),
    ).toEqual({
      k: 2,
      fromPath: '/a?x=1#h',
      returnState: { prior: true },
    });
  });

  it('works without extra state', () => {
    expect(withReturnPath({ pathname: '/only', search: '', hash: '', state: null })).toEqual({
      fromPath: '/only',
      returnState: null,
    });
  });
});

describe('useBackNavigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (useLocation as jest.Mock).mockReset();
    Object.defineProperty(window, 'history', {
      value: { length: 3, state: { idx: 2 } },
      configurable: true,
    });
  });

  it('pops history when fromPath is set instead of pushing a duplicate entry', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/devices/dev-1',
      search: '',
      hash: '',
      state: {
        fromPath: '/units/unit-1',
        returnState: { fromPath: '/units', returnState: null },
      },
      key: 'k',
    });

    const { result } = renderHook(() => useBackNavigation('/devices'));

    act(() => {
      result.current();
    });

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('replaces with fromPath and returnState when there is no in-app history', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/devices/dev-1',
      search: '',
      hash: '',
      state: {
        fromPath: '/units/unit-1',
        returnState: { fromPath: '/units', returnState: null },
      },
      key: 'k',
    });
    Object.defineProperty(window, 'history', {
      value: { length: 1, state: { idx: 0 } },
      configurable: true,
    });

    const { result } = renderHook(() => useBackNavigation('/devices'));

    act(() => {
      result.current();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/units/unit-1', {
      replace: true,
      state: { fromPath: '/units', returnState: null },
    });
  });

  it('navigates back when no fromPath but history allows', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/here',
      search: '',
      hash: '',
      state: null,
      key: 'k',
    });

    const { result } = renderHook(() => useBackNavigation('/home'));

    act(() => {
      result.current();
    });

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('falls back to path when no fromPath and no history', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/here',
      search: '',
      hash: '',
      state: null,
      key: 'k',
    });
    Object.defineProperty(window, 'history', {
      value: { length: 1, state: { idx: 0 } },
      configurable: true,
    });

    const { result } = renderHook(() => useBackNavigation('/fallback', true));

    act(() => {
      result.current();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/fallback', { replace: true });
  });
});

describe('useDetailsBackNavigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (useLocation as jest.Mock).mockReset();
    Object.defineProperty(window, 'history', {
      value: { length: 3, state: { idx: 2 } },
      configurable: true,
    });
  });

  it('uses fromPath for label and pops history on back', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/devices/device-1',
      search: '',
      hash: '',
      state: { fromPath: '/facilities/f1?tab=devices' },
      key: 'k',
    });

    const { result } = renderHook(() =>
      useDetailsBackNavigation({ fallbackPath: '/devices', showWithoutFromPath: false }),
    );

    expect(result.current.showBack).toBe(true);
    expect(result.current.backLabel).toBe('Back to Facility');

    act(() => {
      result.current.goBack();
    });

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('hides back when showWithoutFromPath is false and no fromPath', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/facilities/f1',
      search: '',
      hash: '',
      state: null,
      key: 'k',
    });

    const { result } = renderHook(() =>
      useDetailsBackNavigation({ showWithoutFromPath: false }),
    );

    expect(result.current.showBack).toBe(false);
    expect(result.current.backLabel).toBeUndefined();
  });
});
