import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../../components/bludesign/hooks/useKeyboardShortcuts';

function dispatchKeyDown(
  key: string,
  init: Partial<KeyboardEventInit> = {}
): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  );
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps Ctrl+S / Ctrl+Z / Ctrl+Y to save, undo, and redo', () => {
    const onSave = jest.fn();
    const onUndo = jest.fn();
    const onRedo = jest.fn();

    renderHook(() =>
      useKeyboardShortcuts({
        enabled: true,
        onSave,
        onUndo,
        onRedo,
      })
    );

    dispatchKeyDown('s', { ctrlKey: true });
    dispatchKeyDown('z', { ctrlKey: true });
    dispatchKeyDown('y', { ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('maps Ctrl+Shift+S and Ctrl+Shift+Z to save-as and redo', () => {
    const onSaveAs = jest.fn();
    const onRedo = jest.fn();

    renderHook(() =>
      useKeyboardShortcuts({
        enabled: true,
        onSaveAs,
        onRedo,
      })
    );

    dispatchKeyDown('s', { ctrlKey: true, shiftKey: true });
    dispatchKeyDown('z', { ctrlKey: true, shiftKey: true });

    expect(onSaveAs).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('does not fire tool shortcuts when Ctrl is held', () => {
    const onToggleGrid = jest.fn();

    renderHook(() =>
      useKeyboardShortcuts({
        enabled: true,
        onToggleGrid,
      })
    );

    dispatchKeyDown('g', { ctrlKey: true });

    expect(onToggleGrid).not.toHaveBeenCalled();
  });
});
