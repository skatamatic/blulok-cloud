/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useBackNavigation, withReturnPath } from '@/hooks/useBackNavigation';

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
    expect(withReturnPath({ pathname: '/a', search: '?x=1', hash: '#h' }, { k: 2 })).toEqual({
      k: 2,
      fromPath: '/a?x=1#h',
    });
  });

  it('works without extra state', () => {
    expect(withReturnPath({ pathname: '/only', search: '', hash: '' })).toEqual({
      fromPath: '/only',
    });
  });
});

describe('useBackNavigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    (useLocation as jest.Mock).mockReset();
  });

  it('navigates to fromPath when state differs from current path', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/here',
      search: '',
      hash: '',
      state: { fromPath: '/there' },
      key: 'k',
    });

    const { result } = renderHook(() => useBackNavigation('/home'));

    act(() => {
      result.current();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/there');
  });

  it('navigates back when no fromPath but history allows', () => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/here',
      search: '',
      hash: '',
      state: null,
      key: 'k',
    });
    Object.defineProperty(window, 'history', {
      value: { length: 3, state: { idx: 2 } },
      configurable: true,
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
