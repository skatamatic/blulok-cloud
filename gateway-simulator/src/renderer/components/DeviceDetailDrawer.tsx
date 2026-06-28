import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  deviceKey: string | null;
  onClose: () => void;
  children: (deviceKey: string) => ReactNode;
};

export function DeviceDetailDrawer({ deviceKey, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [renderKey, setRenderKey] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (deviceKey) {
      setRenderKey(deviceKey);
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
  }, [deviceKey]);

  useEffect(() => {
    if (!renderKey) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [renderKey, onClose]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !panelRef.current) return;
    panelRef.current.querySelector<HTMLElement>('.device-detail-nav-item')?.focus();
  }, [visible, renderKey]);

  const handlePanelTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.propertyName !== 'transform' || visible) return;
      setRenderKey(null);
    },
    [visible],
  );

  if (!renderKey) return null;

  return createPortal(
    <div
      className={`device-detail-drawer-backdrop${visible ? ' is-open' : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Device details"
        className="device-detail-drawer-panel"
        onMouseDown={(event) => event.stopPropagation()}
        onTransitionEnd={handlePanelTransitionEnd}
      >
        <div className="device-detail-drawer-panel-inner">{children(renderKey)}</div>
      </div>
    </div>,
    document.body,
  );
}
