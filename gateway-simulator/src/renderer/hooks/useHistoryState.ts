import { useCallback, useEffect, useState } from 'react';
import type { HistoryState } from '@protocol/ipc-channels';
import { errorMessage } from '../utils/error-message.utils';

type ToastError = {
  error: (title: string, message?: string) => void;
};

export function useHistoryState(
  onApply: (result: Awaited<ReturnType<typeof window.simulator.undo>>) => void,
  toast?: ToastError,
) {
  const [history, setHistory] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
  });

  useEffect(() => {
    void window.simulator.getHistoryState().then(setHistory);
    return window.simulator.onHistoryChanged(setHistory);
  }, []);

  const undo = useCallback(async () => {
    if (!history.canUndo) return;
    try {
      const result = await window.simulator.undo();
      onApply(result);
    } catch (err) {
      toast?.error('Undo failed', errorMessage(err));
    }
  }, [history.canUndo, onApply, toast]);

  const redo = useCallback(async () => {
    if (!history.canRedo) return;
    try {
      const result = await window.simulator.redo();
      onApply(result);
    } catch (err) {
      toast?.error('Redo failed', errorMessage(err));
    }
  }, [history.canRedo, onApply, toast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void undo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return { history, undo, redo };
}
