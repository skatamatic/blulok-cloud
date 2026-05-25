import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  EllipsisVerticalIcon,
  CheckIcon,
  TrashIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import { useDropdown } from '@/contexts/DropdownContext';
import { WidgetSize } from '@/types/widget.types';
import { partitionAvailableSizes } from '@/utils/widget-size-menu.utils';
import { isDockSize } from '@/utils/dashboard-layout-engine';

export type { WidgetSize };

interface WidgetSizeDropdownProps {
  widgetId: string;
  currentSize: WidgetSize;
  availableSizes: WidgetSize[];
  onSizeChange: (size: WidgetSize) => void;
  enhancedMenu?: React.ReactNode;
  onRemove?: () => void;
  actionPadding?: string;
  iconSize?: string;
}

const DOCK_LABELS: Record<WidgetSize, string> = {
  'dock-top': 'Dock — Top half',
  'dock-bottom': 'Dock — Bottom half',
  'dock-left': 'Dock — Left half',
  'dock-right': 'Dock — Right half',
  'dock-bottom-two-thirds': 'Dock — Bottom ⅔',
  'dock-full': 'Dock — Full page',
} as Record<WidgetSize, string>;

const DOCK_DIMENSIONS: Record<WidgetSize, string> = {
  'dock-top': '12×3',
  'dock-bottom': '12×3',
  'dock-left': '6×6',
  'dock-right': '6×6',
  'dock-bottom-two-thirds': '12×4',
  'dock-full': '12×6',
} as Record<WidgetSize, string>;

const dockIcon = (variant: 'top' | 'bottom' | 'left' | 'right' | 'bottom-two-thirds' | 'full') => {
  switch (variant) {
    case 'top':
      return (
        <div className="w-6 h-3 border border-current rounded-sm opacity-60 flex flex-col justify-start p-0.5">
          <div className="h-1 w-full bg-current rounded-sm" />
        </div>
      );
    case 'bottom':
      return (
        <div className="w-6 h-3 border border-current rounded-sm opacity-60 flex flex-col justify-end p-0.5">
          <div className="h-1 w-full bg-current rounded-sm" />
        </div>
      );
    case 'left':
      return (
        <div className="w-6 h-3 border border-current rounded-sm opacity-60 flex flex-row justify-start p-0.5">
          <div className="w-2 h-full bg-current rounded-sm" />
        </div>
      );
    case 'right':
      return (
        <div className="w-6 h-3 border border-current rounded-sm opacity-60 flex flex-row justify-end p-0.5">
          <div className="w-2 h-full bg-current rounded-sm" />
        </div>
      );
    case 'bottom-two-thirds':
      return (
        <div className="w-6 h-3 border border-current rounded-sm opacity-60 flex flex-col justify-end p-0.5">
          <div className="h-2 w-full bg-current rounded-sm" />
        </div>
      );
    case 'full':
      return (
        <div className="w-6 h-3 border border-current rounded-sm opacity-80 bg-current/30" />
      );
  }
};

const DOCK_ICONS: Partial<Record<WidgetSize, React.ReactNode>> = {
  'dock-top': dockIcon('top'),
  'dock-bottom': dockIcon('bottom'),
  'dock-left': dockIcon('left'),
  'dock-right': dockIcon('right'),
  'dock-bottom-two-thirds': dockIcon('bottom-two-thirds'),
  'dock-full': dockIcon('full'),
};

export const WidgetSizeDropdown: React.FC<WidgetSizeDropdownProps> = ({
  widgetId,
  currentSize,
  availableSizes,
  onSizeChange,
  enhancedMenu,
  onRemove,
  actionPadding = 'p-1',
  iconSize = 'h-3 w-3',
}) => {
  const { openDropdown, closeDropdown, isDropdownOpen } = useDropdown();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const isOpen = isDropdownOpen(widgetId);
  const { standard: standardSizes, dock: dockSizes } = partitionAvailableSizes(availableSizes);
  const isCurrentDock = isDockSize(currentSize);
  // Undock uses any non-dock size as a trigger; persistence keeps live grid w/h.
  const canUndock = isCurrentDock && standardSizes.length > 0;
  const undockTrigger = canUndock ? standardSizes[0] : null;

  const hasMenuContent =
    dockSizes.length > 0 ||
    Boolean(undockTrigger) ||
    Boolean(enhancedMenu) ||
    Boolean(onRemove);

  const updateDropdownPosition = useCallback(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = enhancedMenu ? 288 : 208;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;

      let left = buttonRect.right - dropdownWidth;
      if (left < margin) {
        left = buttonRect.left;
      }
      if (left + dropdownWidth > viewportWidth - margin) {
        left = viewportWidth - dropdownWidth - margin;
      }

      let top = buttonRect.bottom + 8;
      const estimatedHeight = enhancedMenu ? 320 : 40 + dockSizes.length * 40 + (onRemove ? 48 : 0);

      if (top + estimatedHeight > viewportHeight - margin) {
        const spaceAbove = buttonRect.top - margin - 8;
        if (spaceAbove >= estimatedHeight) {
          top = buttonRect.top - estimatedHeight - 8;
        } else {
          top = margin;
        }
      }

      setDropdownPosition({ top, left });
      if (!isPositioned) {
        setIsPositioned(true);
      }
    }
  }, [isOpen, isPositioned, enhancedMenu, dockSizes.length, onRemove]);

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
    } else {
      setIsPositioned(false);
    }
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => updateDropdownPosition();
    const handleResize = () => updateDropdownPosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updateDropdownPosition]);

  if (!hasMenuContent) {
    return null;
  }

  const handleDockChange = (size: WidgetSize) => {
    onSizeChange(size);
    closeDropdown();
  };

  const renderDockButton = (size: WidgetSize) => (
    <button
      key={size}
      type="button"
      onClick={() => handleDockChange(size)}
      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors duration-200 ${
        currentSize === size
          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
          : 'text-gray-700 dark:text-gray-300'
      }`}
    >
      <div className="flex items-center space-x-2 min-w-0">
        <div className="flex items-center justify-center w-4 h-4 flex-shrink-0">
          {currentSize === size ? (
            <CheckIcon className="h-3 w-3 text-primary-600 dark:text-primary-400" />
          ) : (
            <div className="scale-75">{DOCK_ICONS[size]}</div>
          )}
        </div>
        <span className="truncate text-sm">{DOCK_LABELS[size]}</span>
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">
        {DOCK_DIMENSIONS[size]}
      </span>
    </button>
  );

  const renderDropdown = () => {
    if (!isPositioned) return null;

    const hasDockSection = dockSizes.length > 0;
    const hasRemoveSection = Boolean(onRemove);
    const sectionDivider = (
      <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
    );

    return createPortal(
      <div
        ref={dropdownRef}
        className={`dropdown-menu bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1 ${
          enhancedMenu ? 'w-72' : 'w-52'
        }`}
        style={{
          position: 'fixed',
          top: dropdownPosition.top,
          left: dropdownPosition.left,
          zIndex: 9999,
        }}
      >
        {enhancedMenu && (
          <>
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
              Configuration
            </div>
            <div className="px-3 py-3">{enhancedMenu}</div>
            {(hasDockSection || hasRemoveSection) && sectionDivider}
          </>
        )}

        {hasDockSection && (
          <>
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
              Dock layout
            </div>
            {dockSizes.map((size) => renderDockButton(size))}
            {undockTrigger && (
              <button
                type="button"
                onClick={() => handleDockChange(undockTrigger)}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors duration-200"
                title="Undock — keep current size as a free widget"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <div className="flex items-center justify-center w-4 h-4 flex-shrink-0">
                    <ArrowsPointingInIcon className="h-3.5 w-3.5" />
                  </div>
                  <span className="truncate text-sm">Undock</span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">
                  Restore
                </span>
              </button>
            )}
          </>
        )}

        {hasRemoveSection && (
          <>
            {hasDockSection && sectionDivider}
            <button
              onClick={() => {
                onRemove?.();
                closeDropdown();
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200 flex items-center space-x-3"
            >
              <TrashIcon className="h-4 w-4" />
              <span>Remove Widget</span>
            </button>
          </>
        )}
      </div>,
      document.body
    );
  };

  return (
    <div className="relative dropdown-container">
      <button
        ref={buttonRef}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen) {
            closeDropdown();
          } else {
            openDropdown(widgetId);
          }
        }}
        className={`${actionPadding} rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 relative opacity-0 group-hover:opacity-100`}
        aria-label="Widget options"
        aria-expanded={isOpen}
        title="Widget options"
        style={{ pointerEvents: 'auto', zIndex: isOpen ? 200 : 50 }}
      >
        <EllipsisVerticalIcon className={iconSize} />
      </button>

      {renderDropdown()}
    </div>
  );
};
