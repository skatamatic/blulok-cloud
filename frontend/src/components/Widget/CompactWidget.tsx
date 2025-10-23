import React from 'react';
import { motion } from 'framer-motion';
import { WidgetSizeDropdown, WidgetSize } from './WidgetSizeDropdown';

export interface CompactWidgetProps {
  id: string;
  title: string;
  size: WidgetSize;
  availableSizes: WidgetSize[];
  onSizeChange: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
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
  onGridSizeChange,
  onRemove,
  children,
  className = '',
  isDragging = false,
  suppressTitleOverlay = false,
}) => {
  const sizeToGrid = {
    tiny: { w: 1, h: 1 },      // 136×136px - Single metric
    small: { w: 2, h: 1 },     // 288×136px - Compact horizontal
    medium: { w: 3, h: 2 },    // 440×288px - Standard widget
    'medium-tall': { w: 3, h: 5 },  // 440×680px - Tall narrow widget
    large: { w: 4, h: 3 },     // 592×424px - Extended content
    huge: { w: 6, h: 4 },      // 880×544px - Maximum dashboard real estate
    'large-wide': { w: 6, h: 3 },  // 880×424px - Wide extended content
    'huge-wide': { w: 9, h: 4 },   // 1304×544px - Ultra-wide dashboard
  };

  const handleSizeChange = (newSize: WidgetSize) => {
    onSizeChange(newSize);
    onGridSizeChange?.(sizeToGrid[newSize]);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`card h-full group relative compact-widget ${isDragging ? 'shadow-lg scale-105 z-10' : ''} ${className}`}
      style={{
        transformOrigin: 'center',
      }}
    >
      {/* Drag Handle - Entire Widget for Compact Sizes */}
      <div className="drag-handle h-full cursor-grab hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors duration-200 relative">
        
        {/* Size Control - Top Right Corner */}
        <div 
          className="absolute top-2 right-2"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ pointerEvents: 'auto', zIndex: 100 }}
        >
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <WidgetSizeDropdown
              widgetId={id}
              currentSize={size}
              availableSizes={availableSizes}
              onSizeChange={handleSizeChange}
              onRemove={onRemove}
            />
          </div>
        </div>

        {/* Widget Content - Full Area */}
        <div className="p-3 h-full pointer-events-none">
          {children}
        </div>

        {/* Title Overlay - Only show on hover when not suppressed */}
        {!suppressTitleOverlay && (
          <div className={`absolute ${size === 'tiny' ? 'bottom-2 left-2' : 'top-2 left-2'} pointer-events-none z-20`}>
            <div className="title-overlay text-xs font-medium text-gray-700 dark:text-gray-300 px-2 py-1 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 transform group-hover:scale-105">
              {title}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
