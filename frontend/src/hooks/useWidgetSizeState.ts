import { useCallback, useEffect, useState } from 'react';
import { WidgetSize } from '@/types/widget.types';

/**
 * Local widget size for responsive interior layout, synced with dashboard grid via onSizeChange.
 */
export function useWidgetSizeState(
  currentSize: WidgetSize | undefined,
  initialSize: WidgetSize,
  onSizeChange?: (size: WidgetSize) => void
) {
  const [size, setSize] = useState<WidgetSize>(currentSize ?? initialSize);

  useEffect(() => {
    if (currentSize && currentSize !== size) {
      setSize(currentSize);
    }
  }, [currentSize, size]);

  const handleSizeChange = useCallback(
    (next: WidgetSize) => {
      setSize(next);
      onSizeChange?.(next);
    },
    [onSizeChange]
  );

  return { size, handleSizeChange };
}
