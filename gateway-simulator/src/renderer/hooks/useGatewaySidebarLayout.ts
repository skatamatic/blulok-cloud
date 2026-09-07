import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampSidebarWidth,
  readSidebarCollapsed,
  readSidebarWidth,
  writeSidebarCollapsed,
  writeSidebarWidth,
} from '../utils/gateway-sidebar-layout.utils';

export function useGatewaySidebarLayout() {
  const [width, setWidth] = useState(readSidebarWidth);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      if (collapsed) return;
      event.preventDefault();
      resizeRef.current = { startX: event.clientX, startWidth: width };
      setResizing(true);
    },
    [collapsed, width],
  );

  useEffect(() => {
    if (!resizing) return;

    const onMove = (event: MouseEvent) => {
      const start = resizeRef.current;
      if (!start) return;
      const next = clampSidebarWidth(start.startWidth + (event.clientX - start.startX));
      setWidth(next);
    };

    const onUp = () => {
      resizeRef.current = null;
      setResizing(false);
      setWidth((current) => {
        writeSidebarWidth(current);
        return current;
      });
    };

    document.body.classList.add('gateway-sidebar-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      document.body.classList.remove('gateway-sidebar-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  return {
    width,
    collapsed,
    resizing,
    toggleCollapsed,
    startResize,
  };
}
