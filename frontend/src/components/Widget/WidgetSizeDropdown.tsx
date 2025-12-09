import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  EllipsisVerticalIcon, 
  CheckIcon, 
  TrashIcon
} from '@heroicons/react/24/outline';
import { useDropdown } from '@/contexts/DropdownContext';

export type WidgetSize = 'tiny' | 'small' | 'medium' | 'medium-tall' | 'large' | 'huge' | 'large-wide' | 'huge-wide' | 'mega-tall';

interface WidgetSizeDropdownProps {
  widgetId: string;
  currentSize: WidgetSize;
  availableSizes: WidgetSize[];
  onSizeChange: (size: WidgetSize) => void;
  enhancedMenu?: React.ReactNode;
  onRemove?: () => void;
}

export const WidgetSizeDropdown: React.FC<WidgetSizeDropdownProps> = ({
  widgetId,
  currentSize,
  availableSizes,
  onSizeChange,
  enhancedMenu,
  onRemove,
}) => {
  const { openDropdown, closeDropdown, isDropdownOpen } = useDropdown();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const isOpen = isDropdownOpen(widgetId);

  // Calculate dropdown position when it opens and on scroll
  const updateDropdownPosition = useCallback(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = enhancedMenu ? 288 : 192; // w-72 = 288px, w-48 = 192px
      
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;
      
      // Calculate horizontal position (default: right-aligned to button)
      let left = buttonRect.right - dropdownWidth;
      
      // Adjust horizontal position if off-screen
      if (left < margin) {
        left = buttonRect.left; // Align to left of button
      }
      if (left + dropdownWidth > viewportWidth - margin) {
        left = viewportWidth - dropdownWidth - margin; // Clamp to right edge
      }
      
      // Calculate vertical position - try below first, then above
      let top = buttonRect.bottom + 8;
      
      // Estimate dropdown height based on content
      const estimatedHeight = enhancedMenu ? 320 : 240; // Slightly more generous estimates
      
      // Check if dropdown would go off bottom of viewport
      if (top + estimatedHeight > viewportHeight - margin) {
        // Try positioning above the button
        const spaceAbove = buttonRect.top - margin - 8;
        
        if (spaceAbove >= estimatedHeight) {
          // Enough space above - position above button
          top = buttonRect.top - estimatedHeight - 8;
        } else {
          // Not enough space above either - position above but let it extend to top margin
          top = margin;
        }
      }
      
      const newPosition = { top, left };
      setDropdownPosition(newPosition);
      
      if (!isPositioned) {
        setIsPositioned(true);
      }
    }
  }, [isOpen, isPositioned, enhancedMenu]);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
    } else {
      setIsPositioned(false);
    }
  }, [isOpen, updateDropdownPosition]);

  // Update position on scroll and resize
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      updateDropdownPosition();
    };

    const handleResize = () => {
      updateDropdownPosition();
    };

    // Listen to both window scroll and any parent scroll
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updateDropdownPosition]);

  const sizeLabels: Record<WidgetSize, string> = {
    tiny: 'Tiny',
    small: 'Small',
    medium: 'Medium',
    'medium-tall': 'Medium (Tall)',
    large: 'Large',
    huge: 'Huge',
    'large-wide': 'Large (Wide)',
    'huge-wide': 'Huge (Wide)',
    'mega-tall': 'Mega (Tall)',
  };

  const sizeDimensions: Record<WidgetSize, string> = {
    tiny: '1×1',
    small: '2×1',
    medium: '3×2',
    'medium-tall': '3×5',
    large: '4×3',
    huge: '6×4',
    'large-wide': '6×3',
    'huge-wide': '9×4',
    'mega-tall': '9×6',
  };

  const sizeIcons: Record<WidgetSize, React.ReactNode> = {
    tiny: (
      <div className="w-3 h-3 bg-current rounded-sm opacity-60" />
    ),
    small: (
      <div className="flex space-x-0.5">
        <div className="w-1.5 h-3 bg-current rounded-sm opacity-60" />
        <div className="w-1.5 h-3 bg-current rounded-sm opacity-60" />
      </div>
    ),
    medium: (
      <div className="grid grid-cols-3 gap-0.5 w-4 h-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-current rounded-sm opacity-60" />
        ))}
      </div>
    ),
    'medium-tall': (
      <div className="grid grid-cols-3 gap-0.5 w-4 h-6">
        {Array.from({ length: 15 }, (_, i) => (
          <div key={i} className="bg-current rounded-sm opacity-60" />
        ))}
      </div>
    ),
    large: (
      <div className="grid grid-cols-4 gap-0.5 w-5 h-3">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="bg-current rounded-sm opacity-60" />
        ))}
      </div>
    ),
    huge: (
      <div className="grid grid-cols-6 gap-0.5 w-6 h-4">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="bg-current rounded-sm opacity-60" />
        ))}
      </div>
    ),
    'large-wide': (
      <div className="grid grid-cols-6 gap-0.5 w-6 h-3">
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="bg-current rounded-sm opacity-60" />
        ))}
      </div>
    ),
    'huge-wide': (
      <div className="grid grid-cols-9 gap-0.5 w-8 h-4">
        {Array.from({ length: 36 }, (_, i) => (
          <div key={i} className="bg-current rounded-sm opacity-60" />
        ))}
      </div>
    ),
    'mega-tall': (
      <div className="grid grid-cols-9 gap-0.5 w-8 h-6">
        {Array.from({ length: 54 }, (_, i) => (
          <div key={i} className="bg-current rounded-sm opacity-60" />
        ))}
      </div>
    ),
  };

  // No need for individual click outside handlers - managed by DropdownContext

  // Don't render if only one size available
  if (availableSizes.length <= 1) {
    return null;
  }

  const handleSizeChange = (size: WidgetSize) => {
    onSizeChange(size);
    closeDropdown();
  };

  const renderDropdown = () => {
    // Don't render until positioned to prevent flash
    if (!isPositioned) return null;

    return createPortal(
      <div 
        ref={dropdownRef}
        className={`dropdown-menu bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1 ${
          enhancedMenu ? 'w-72' : 'w-48'
        }`}
        style={{
          position: 'fixed',
          top: dropdownPosition.top,
          left: dropdownPosition.left,
          zIndex: 9999,
        }}
      >
        {/* Enhanced Configuration Section */}
        {enhancedMenu && (
          <>
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
              Configuration
            </div>
            <div className="px-3 py-3">
              {enhancedMenu}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
          </>
        )}

        {/* Size Selection Section */}
        <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
          Resize ({sizeLabels[currentSize]})
        </div>
        <div className={`${enhancedMenu ? 'grid grid-cols-2 gap-1 p-1' : ''}`}>
          {availableSizes.map((size) => (
            <button
              key={size}
              onClick={() => handleSizeChange(size)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors duration-200 ${
                enhancedMenu ? 'rounded' : ''
              } ${
                currentSize === size 
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' 
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="flex items-center justify-center w-4 h-4">
                  {currentSize === size ? (
                    <CheckIcon className="h-3 w-3 text-primary-600 dark:text-primary-400" />
                  ) : (
                    <div className="scale-75">{sizeIcons[size]}</div>
                  )}
                </div>
                <span className={enhancedMenu ? 'text-xs' : 'text-sm'}>{sizeLabels[size]}</span>
              </div>
              {!enhancedMenu && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {sizeDimensions[size]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Remove Widget Section */}
        {onRemove && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
            <button
              onClick={() => {
                onRemove();
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
        className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 relative opacity-0 group-hover:opacity-100"
        aria-label="Resize widget"
        aria-expanded={isOpen}
        title="Resize widget"
        style={{ pointerEvents: 'auto', zIndex: isOpen ? 200 : 50 }}
      >
        <EllipsisVerticalIcon className="h-4 w-4" />
      </button>

      {renderDropdown()}
    </div>
  );
};
