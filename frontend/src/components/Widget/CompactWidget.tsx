import React from 'react';
import { motion } from 'framer-motion';
import { WidgetSizeDropdown, WidgetSize } from './WidgetSizeDropdown';

export interface CompactWidgetProps {
  id: string;
  title: string;
  size: WidgetSize;
  availableSizes: WidgetSize[];
  onSizeChange: (size: WidgetSize) => void;
  /** @deprecated parent controls grid sizing via onSizeChange */
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  children: React.ReactNode;
  className?: string;
  isDragging?: boolean;
  suppressTitleOverlay?: boolean;
}

export const CompactWidget: React.FC<CompactWidgetProps> = ({
  id,
  title,
  size,
  availableSizes,
  onSizeChange,
  onRemove,
  readOnly = false,
  children,
  className = '',
  isDragging = false,
  suppressTitleOverlay = false,
}) => {
  const isTiny = size === 'tiny';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      data-size={size}
      className={`card compact-widget h-full min-h-0 flex flex-col overflow-hidden group relative ${
        isTiny ? 'compact-widget--tiny' : ''
      } ${isDragging ? 'shadow-lg scale-105 z-10' : ''} ${className}`}
      aria-label={title}
      style={{ transformOrigin: 'center' }}
    >
      <div
        className={`flex h-full min-h-0 flex-col relative transition-colors duration-200 ${
          readOnly
            ? 'cursor-default'
            : 'drag-handle cursor-grab'
        }`}
      >
        <div
          className="widget-header-actions no-drag absolute top-1 right-1"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            className={`opacity-0 group-hover:opacity-100 transition-opacity duration-200 origin-top-right ${
              isTiny ? 'scale-90' : 'scale-75'
            }`}
          >
            {!readOnly && (
            <WidgetSizeDropdown
              widgetId={id}
              currentSize={size}
              availableSizes={availableSizes}
              onSizeChange={onSizeChange}
              onRemove={onRemove}
              actionPadding={isTiny ? 'p-1' : 'p-0.5'}
              iconSize={isTiny ? 'h-3 w-3' : 'h-2.5 w-2.5'}
            />
            )}
          </div>
        </div>

        <div
          className={`compact-widget-body flex-1 min-h-0 w-full overflow-hidden pointer-events-none ${
            isTiny ? 'p-[3px]' : 'p-2 pr-9'
          }`}
        >
          <div className="h-full w-full min-h-0">{children}</div>
        </div>

        {!suppressTitleOverlay && (
          <div className="pointer-events-none absolute inset-x-1 bottom-1 z-20 flex justify-center">
            <div className="title-overlay max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-700 opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 dark:text-gray-300">
              {title}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
