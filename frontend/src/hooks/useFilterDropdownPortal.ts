import { RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type FilterDropdownPosition = {
  top: number;
  left: number;
  width: number;
};

/** Positions a filter combobox menu via fixed coordinates so it escapes overflow-hidden ancestors. */
export function useFilterDropdownPortal(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  deps: ReadonlyArray<unknown> = [],
) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<FilterDropdownPosition>({ top: 0, left: 0, width: 0 });

  const updatePosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [containerRef]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies layout deps (e.g. searchTerm)
  }, [isOpen, updatePosition, ...deps]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  const dropdownStyle: CSSProperties = {
    position: 'fixed',
    top: dropdownPos.top,
    left: dropdownPos.left,
    width: dropdownPos.width,
    minWidth: 300,
  };

  return { dropdownRef, dropdownStyle, updatePosition };
}
