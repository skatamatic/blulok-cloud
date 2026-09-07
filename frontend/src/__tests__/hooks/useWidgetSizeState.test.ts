/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { WidgetSize } from '@/types/widget.types';

describe('useWidgetSizeState', () => {
  it('calls onSizeChange when handleSizeChange runs', () => {
    const onSizeChange = jest.fn();
    const { result } = renderHook(() =>
      useWidgetSizeState(undefined, 'medium', onSizeChange)
    );

    act(() => {
      result.current.handleSizeChange('large');
    });

    expect(result.current.size).toBe('large');
    expect(onSizeChange).toHaveBeenCalledWith('large');
  });

  it('syncs from currentSize prop', () => {
    const { result, rerender } = renderHook(
      ({ currentSize }) => useWidgetSizeState(currentSize, 'medium'),
      { initialProps: { currentSize: 'medium' as WidgetSize } }
    );

    rerender({ currentSize: 'huge' as WidgetSize });
    expect(result.current.size).toBe('huge');
  });
});
