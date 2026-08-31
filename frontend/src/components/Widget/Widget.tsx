import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import { WidgetSizeDropdown, WidgetSize } from './WidgetSizeDropdown';
import { CompactWidget } from './CompactWidget';
import { sizeToGrid } from '@/utils/widget-size.utils';
import { getWidgetLayoutProfile } from '@/utils/widget-layout.utils';
import { isDockSize } from '@/utils/dashboard-layout-engine';

export interface WidgetProps {
  id: string;
  title: string;
  size?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  children: React.ReactNode;
  className?: string;
  isDragging?: boolean;
  enhancedMenu?: React.ReactNode;
  onRemove?: () => void;
  suppressTitleOverlay?: boolean;
  /** When provided, a maximize/minimize control is shown in the header. */
  onFullscreenToggle?: () => void;
  /** True when the widget is currently presented in fullscreen "focus" mode. */
  isFullscreen?: boolean;
  /** Remove content padding so edge-to-edge visuals (e.g. 3D viewer) can fill the cell. */
  edgeToEdge?: boolean;
  /** Live grid cell dimensions — drives interior layout when geometry is free-form. */
  gridSize?: { w: number; h: number };
  /** When true, layout controls (size menu, remove) are hidden. */
  readOnly?: boolean;
}

export const Widget: React.FC<WidgetProps> = ({
  id,
  title,
  size = 'medium',
  availableSizes = ['medium'],
  onSizeChange,
  onGridSizeChange,
  children,
  className = '',
  isDragging = false,
  enhancedMenu,
  onRemove,
  suppressTitleOverlay = false,
  onFullscreenToggle,
  isFullscreen = false,
  edgeToEdge = false,
  gridSize,
  readOnly = false,
}) => {
  const handleSizeChange = (newSize: WidgetSize) => {
    if (onSizeChange) {
      onSizeChange(newSize);
    } else {
      onGridSizeChange?.(sizeToGrid(newSize));
    }
  };

  // Use CompactWidget only for tiny size (dynamic check)
  const currentSize = size || 'medium';
  if (currentSize === 'tiny') {
    return (
      <CompactWidget
        id={id}
        title={title}
        size={currentSize}
        availableSizes={availableSizes}
        onSizeChange={handleSizeChange}
        onGridSizeChange={onGridSizeChange}
        onRemove={onRemove}
        readOnly={readOnly}
        className={className}
        isDragging={isDragging}
        suppressTitleOverlay={suppressTitleOverlay}
      >
        {children}
      </CompactWidget>
    );
  }

  const layout = getWidgetLayoutProfile(currentSize, {
    isFullscreen,
    gridW: gridSize?.w,
    gridH: gridSize?.h,
  });
  const styles = layout.shell;
  const contentPadding = edgeToEdge ? 'p-0' : styles.contentPadding;
  const isDocked = isDockSize(currentSize);
  const canDrag = !readOnly && !isDocked;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`card h-full min-h-0 flex flex-col overflow-hidden group ${isDragging ? 'shadow-lg scale-105 z-10' : ''} ${className}`}
      style={{
        transformOrigin: 'center',
      }}
      data-size={currentSize}
    >
      {/* Widget Header — drag handle is title only; actions stay interactive */}
      <div
        className={`widget-header flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0 ${styles.headerPadding}`}
      >
        <div
          className={`drag-handle flex-1 min-w-0 flex items-center min-h-[1.25rem] transition-colors duration-200 ${
            canDrag
              ? 'cursor-grab -my-1 py-1 rounded-md'
              : 'cursor-default'
          }`}
        >
          <h3
            className={`${styles.titleSize} font-medium leading-tight text-gray-900 dark:text-white select-none pointer-events-none ${styles.titleTruncate} pr-2 w-full`}
          >
            {title}
          </h3>
        </div>
        <div
          className="widget-header-actions no-drag flex items-center space-x-0.5 flex-shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
           {onFullscreenToggle && (
             <motion.button
               type="button"
               whileTap={{ scale: 0.92 }}
               whileHover={{ scale: 1.05 }}
               onClick={onFullscreenToggle}
               aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
               title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
               className={`${styles.headerActionPadding} rounded-md text-gray-400 dark:text-gray-500 hover:text-[#147FD4] dark:hover:text-[#147FD4] hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 opacity-0 group-hover:opacity-100`}
             >
               {isFullscreen ? (
                 <ArrowsPointingInIcon className={styles.headerIconSize} />
               ) : (
                 <ArrowsPointingOutIcon className={styles.headerIconSize} />
               )}
             </motion.button>
           )}
           {!readOnly && (
             <WidgetSizeDropdown
               widgetId={id}
               currentSize={size}
               availableSizes={availableSizes}
               onSizeChange={handleSizeChange}
               enhancedMenu={enhancedMenu}
               onRemove={onRemove}
               actionPadding={styles.headerActionPadding}
               iconSize={styles.headerIconSize}
             />
           )}
         </div>
      </div>

      {/* Widget Content - flex child must shrink in grid (min-h-0) so scroll works */}
      <div
        className={`widget-content no-drag ${contentPadding} flex-1 min-h-0 ${styles.contentOverflow}`}
      >
        {children}
      </div>
    </motion.div>
  );
};
