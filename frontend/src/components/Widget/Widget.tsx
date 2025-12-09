import React from 'react';
import { motion } from 'framer-motion';
import { WidgetSizeDropdown, WidgetSize } from './WidgetSizeDropdown';
import { CompactWidget } from './CompactWidget';

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
}) => {
  // Size to grid dimensions mapping
  const sizeToGrid: Record<WidgetSize, { w: number; h: number }> = {
    tiny: { w: 1, h: 1 },      // 136×136px - Single metric
    small: { w: 2, h: 1 },     // 288×136px - Compact horizontal
    medium: { w: 3, h: 2 },    // 440×288px - Standard widget
    'medium-tall': { w: 3, h: 5 },  // 440×680px - Tall narrow widget
    large: { w: 4, h: 3 },     // 592×424px - Extended content
    huge: { w: 6, h: 4 },      // 880×544px - Maximum dashboard real estate
    'large-wide': { w: 6, h: 3 },  // 880×424px - Wide extended content
    'huge-wide': { w: 9, h: 4 },   // 1304×544px - Ultra-wide dashboard
    'mega-tall': { w: 9, h: 6 },   // 1304×816px - Ultra-wide tall dashboard
  };

  const handleSizeChange = (newSize: WidgetSize) => {
    onSizeChange?.(newSize);
    // Also notify parent about grid size change
    onGridSizeChange?.(sizeToGrid[newSize]);
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
        className={className}
        isDragging={isDragging}
        suppressTitleOverlay={suppressTitleOverlay}
      >
        {children}
      </CompactWidget>
    );
  }

  // Determine responsive styling based on widget size
  const getResponsiveStyles = (size: WidgetSize) => {
    switch (size) {
      case 'small':
        return {
          headerPadding: 'px-2 py-1.5',
          contentPadding: 'p-2',
          titleSize: 'text-xs',
          titleTruncate: 'truncate'
        };
      case 'medium':
        return {
          headerPadding: 'px-5 py-4',
          contentPadding: 'p-5',
          titleSize: 'text-base',
          titleTruncate: ''
        };
      case 'medium-tall':
        return {
          headerPadding: 'px-5 py-4',
          contentPadding: 'p-5',
          titleSize: 'text-base',
          titleTruncate: ''
        };
      default: // large, huge, etc.
        return {
          headerPadding: 'px-6 py-4',
          contentPadding: 'p-6',
          titleSize: 'text-lg',
          titleTruncate: ''
        };
    }
  };

  const styles = getResponsiveStyles(currentSize);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`card h-full group ${isDragging ? 'shadow-lg scale-105 z-10' : ''} ${className}`}
      style={{
        transformOrigin: 'center',
      }}
      data-size={currentSize}
    >
      {/* Widget Header - Draggable Area */}
      <div className={`drag-handle flex items-center justify-between ${styles.headerPadding} border-b border-gray-200 dark:border-gray-700 flex-shrink-0 cursor-grab hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200`}>
        <h3 className={`${styles.titleSize} font-medium text-gray-900 dark:text-white select-none pointer-events-none ${styles.titleTruncate} pr-2`}>
          {title}
        </h3>
         <div 
           className="flex items-center space-x-2 flex-shrink-0" 
           onMouseDown={(e) => e.stopPropagation()}
           onClick={(e) => e.stopPropagation()}
           style={{ pointerEvents: 'auto' }}
         >
           <WidgetSizeDropdown
             widgetId={id}
             currentSize={size}
             availableSizes={availableSizes}
             onSizeChange={handleSizeChange}
             enhancedMenu={enhancedMenu}
             onRemove={onRemove}
           />
         </div>
      </div>

      {/* Widget Content - Size-appropriate scrolling */}
      <div className={`widget-content no-drag ${styles.contentPadding} ${
        currentSize === 'small' ? 'overflow-hidden' : 'overflow-auto'
      } flex-1`}>
        {children}
      </div>
    </motion.div>
  );
};
