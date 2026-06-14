/**
 * Compact legend for live unit colors in 2D facility views.
 */

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { LIVE_STATE_LEGEND } from '../layout-import/layoutImportMetadata';

interface ViewerLiveStateLegendProps {
  className?: string;
}

export const ViewerLiveStateLegend: React.FC<ViewerLiveStateLegendProps> = ({
  className = '',
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  return (
    <div
      className={`
        flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 text-[10px] font-medium
        backdrop-blur-md border shadow-sm
        ${isDark ? 'bg-gray-900/85 border-gray-700/60 text-gray-300' : 'bg-white/90 border-gray-200/80 text-gray-600'}
        ${className}
      `}
      aria-label="Live unit status legend"
    >
      {LIVE_STATE_LEGEND.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm border border-black/10 flex-shrink-0"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  );
};
