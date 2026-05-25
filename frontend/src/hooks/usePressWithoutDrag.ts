import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_THRESHOLD_PX = 6;

type PressSession = {
  pointerId: number;
  originX: number;
  originY: number;
  exceeded: boolean;
  gridDrag: boolean;
};

function isGridRepositionActive(): boolean {
  return Boolean(
    document.querySelector('.react-grid-item.react-draggable-dragging') ||
      document.querySelector('.widget-grid')?.closest('.dragging')
  );
}

/**
 * Fires `onPress` only for taps — not when the pointer moved enough to count as
 * a drag or when the dashboard grid is repositioning a widget.
 */
export function usePressWithoutDrag(
  onPress: () => void,
  options?: { disabled?: boolean; threshold?: number }
) {
  const { disabled = false, threshold = DEFAULT_THRESHOLD_PX } = options ?? {};
  const sessionRef = useRef<PressSession | null>(null);
  const suppressClickRef = useRef(false);
  const pointerPressRef = useRef(false);

  const clearDocumentListeners = useRef<(() => void) | null>(null);

  const detachDocumentListeners = useCallback(() => {
    clearDocumentListeners.current?.();
    clearDocumentListeners.current = null;
  }, []);

  const onDocumentPointerMove = useCallback(
    (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dx = e.clientX - session.originX;
      const dy = e.clientY - session.originY;
      if (Math.hypot(dx, dy) > threshold) {
        session.exceeded = true;
      }
      if (isGridRepositionActive()) {
        session.gridDrag = true;
      }
    },
    [threshold]
  );

  const onDocumentPointerEnd = useCallback(
    (e: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      detachDocumentListeners();

      const { exceeded, gridDrag } = session;
      sessionRef.current = null;

      const dragLike = exceeded || gridDrag || isGridRepositionActive();
      if (!disabled && !dragLike) {
        // Mark before rAF so the synthetic click (same pointer gesture) cannot fire onPress again.
        pointerPressRef.current = true;
        suppressClickRef.current = true;
        requestAnimationFrame(() => {
          onPress();
        });
        return;
      }
      suppressClickRef.current = true;
    },
    [detachDocumentListeners, disabled, onPress]
  );

  const attachDocumentListeners = useCallback(() => {
    detachDocumentListeners();
    document.addEventListener('pointermove', onDocumentPointerMove);
    document.addEventListener('pointerup', onDocumentPointerEnd);
    document.addEventListener('pointercancel', onDocumentPointerEnd);
    clearDocumentListeners.current = () => {
      document.removeEventListener('pointermove', onDocumentPointerMove);
      document.removeEventListener('pointerup', onDocumentPointerEnd);
      document.removeEventListener('pointercancel', onDocumentPointerEnd);
    };
  }, [detachDocumentListeners, onDocumentPointerEnd, onDocumentPointerMove]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;

      suppressClickRef.current = false;
      pointerPressRef.current = false;

      sessionRef.current = {
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        exceeded: false,
        gridDrag: isGridRepositionActive(),
      };

      attachDocumentListeners();
    },
    [attachDocumentListeners, disabled]
  );

  useEffect(() => detachDocumentListeners, [detachDocumentListeners]);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      if (
        suppressClickRef.current ||
        pointerPressRef.current ||
        isGridRepositionActive()
      ) {
        suppressClickRef.current = false;
        pointerPressRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onPress();
    },
    [disabled, onPress]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress();
      }
    },
    [disabled, onPress]
  );

  return {
    pressProps: {
      role: 'button' as const,
      tabIndex: disabled ? -1 : 0,
      'aria-disabled': disabled || undefined,
      onPointerDown,
      onClick,
      onKeyDown,
    },
  };
}
