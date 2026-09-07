import { WidgetSize } from '@/types/widget.types';
import { isDockSize } from '@/utils/dashboard-layout-engine';

export function partitionAvailableSizes(sizes: WidgetSize[]): {
  standard: WidgetSize[];
  dock: WidgetSize[];
} {
  const dock: WidgetSize[] = [];
  const standard: WidgetSize[] = [];
  for (const s of sizes) {
    if (isDockSize(s)) dock.push(s);
    else standard.push(s);
  }
  return { standard, dock };
}

