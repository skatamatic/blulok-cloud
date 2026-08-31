import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const HEADER_GAP_PX = 8;

function measureStacked(nav: HTMLElement): boolean {
  const identity = nav.querySelector<HTMLElement>('.gateway-tab-identity');
  const tabRow = nav.querySelector<HTMLElement>('.panel-tab-row');
  if (!tabRow) return false;

  const identityWidth = identity?.offsetWidth ?? 0;
  const needed = identityWidth + tabRow.scrollWidth + HEADER_GAP_PX * 2;
  return needed > nav.clientWidth;
}

export function useStackedPanelHeader(): {
  headerRef: RefObject<HTMLDivElement>;
  stacked: boolean;
} {
  const headerRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const nav = header.querySelector<HTMLElement>('.panel-tab-bar');
    if (!nav) return;

    const update = () => {
      setStacked(measureStacked(nav));
    };

    const observer = new ResizeObserver(update);
    observer.observe(nav);

    const tabRow = nav.querySelector<HTMLElement>('.panel-tab-row');
    const identity = nav.querySelector<HTMLElement>('.gateway-tab-identity');
    if (tabRow) observer.observe(tabRow);
    if (identity) observer.observe(identity);

    update();
    return () => observer.disconnect();
  }, []);

  return { headerRef, stacked };
}
