/**
 * Floating Panel
 * 
 * A draggable, collapsible, resizable floating panel for the BluDesign editor.
 * Features:
 * - Drag by header only
 * - Collapse/expand
 * - Constrained to parent bounds
 * - Resizable with optional snap
 * - Theme-aware styling
 * - Scrollable content
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { startUICapture, endUICapture } from './UICapture';

export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'none';

export interface PanelState {
  x: number;
  y: number;
  width?: number;
  height?: number;
  collapsed: boolean;
}

interface FloatingPanelProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  position: PanelState;
  anchor?: AnchorPosition;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  resizable?: boolean; // Enable horizontal (width) resizing
  resizableHeight?: boolean; // Enable vertical (height) resizing
  resizeSnapWidth?: number;
  zIndex?: number;
  boundsRef?: React.RefObject<HTMLDivElement>;
  closable?: boolean; // If true, show X button to hide panel
  children: React.ReactNode | ((currentWidth: number, currentHeight: number) => React.ReactNode); // Support function for dynamic dimensions
  onStateChange: (state: Partial<PanelState>) => void;
  onResizing?: (width: number, height?: number) => void; // Real-time feedback during resize
  onClose?: () => void; // Called when X button clicked
  onBringToFront?: () => void; // Called when panel should be brought to front (click/drag)
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  id,
  title,
  icon,
  position,
  anchor = 'none',
  defaultWidth = 240,
  minWidth = 180,
  maxWidth = 600,
  defaultHeight,
  minHeight = 150,
  maxHeight = 500,
  resizable = false,
  resizableHeight = false,
  resizeSnapWidth,
  zIndex = 30,
  boundsRef,
  closable = false,
  children,
  onStateChange,
  onResizing,
  onClose,
  onBringToFront,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const [isResizingBoth, setIsResizingBoth] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  // Use props directly, only local override during active drag/resize
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeWidthOffset, setResizeWidthOffset] = useState(0);
  const [resizeHeightOffset, setResizeHeightOffset] = useState(0);
  
  // Track if we actually moved during drag (to prevent click after drag)
  const didDragRef = useRef(false);
  const dragPreventClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Drag state refs
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Computed values (track any resize state)
  const isResizing = isResizingWidth || isResizingHeight || isResizingBoth;
  
  // Computed position and dimensions (props + offsets during drag/resize)
  const currentX = position.x + (isDragging ? dragOffset.x : 0);
  const currentY = position.y + (isDragging ? dragOffset.y : 0);
  const currentWidth = (position.width ?? defaultWidth) + (isResizing ? resizeWidthOffset : 0);
  const currentHeight = defaultHeight 
    ? (position.height ?? defaultHeight) + (isResizing ? resizeHeightOffset : 0)
    : undefined;

  // Get bounds for constraining
  const getBounds = useCallback(() => {
    if (boundsRef?.current) {
      const rect = boundsRef.current.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }, [boundsRef]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!headerRef.current?.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.preventDefault();
    e.stopPropagation();
    // CRITICAL: Stop the NATIVE event propagation to prevent OrbitControls from receiving it
    // React's stopPropagation only affects synthetic events, not native DOM events
    e.nativeEvent.stopImmediatePropagation();
    startUICapture(`panel-drag-${id}`);
    setIsDragging(true);
    setIsFocused(true);
    didDragRef.current = false;
    setDragOffset({ x: 0, y: 0 });
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
    
    // Bring panel to front when dragging starts
    onBringToFront?.();
  }, [id, position.x, position.y, onBringToFront]);

  // Handle width resize start
  const handleResizeWidthStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    startUICapture(`panel-resize-width-${id}`);
    setIsResizingWidth(true);
    setIsFocused(true);
    setResizeWidthOffset(0);
    setResizeHeightOffset(0);
    resizeStartRef.current = { 
      x: e.clientX, 
      y: e.clientY,
      width: position.width ?? defaultWidth, 
      height: position.height ?? defaultHeight ?? maxHeight 
    };
  }, [id, position.width, position.height, defaultWidth, defaultHeight, maxHeight]);

  // Handle height resize start
  const handleResizeHeightStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    startUICapture(`panel-resize-height-${id}`);
    setIsResizingHeight(true);
    setIsFocused(true);
    setResizeWidthOffset(0);
    setResizeHeightOffset(0);
    resizeStartRef.current = { 
      x: e.clientX, 
      y: e.clientY,
      width: position.width ?? defaultWidth, 
      height: position.height ?? defaultHeight ?? maxHeight 
    };
  }, [id, position.width, position.height, defaultWidth, defaultHeight, maxHeight]);

  // Handle corner (both) resize start
  const handleResizeBothStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    startUICapture(`panel-resize-both-${id}`);
    setIsResizingBoth(true);
    setIsFocused(true);
    setResizeWidthOffset(0);
    setResizeHeightOffset(0);
    resizeStartRef.current = { 
      x: e.clientX, 
      y: e.clientY,
      width: position.width ?? defaultWidth, 
      height: position.height ?? defaultHeight ?? maxHeight 
    };
  }, [id, position.width, position.height, defaultWidth, defaultHeight, maxHeight]);

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        didDragRef.current = true;
      }
      
      const bounds = getBounds();
      const panelWidth = panelRef.current?.offsetWidth ?? currentWidth;
      const panelHeight = panelRef.current?.offsetHeight ?? 100;
      
      // Calculate constrained position
      let newX = dragStartRef.current.posX + deltaX;
      let newY = dragStartRef.current.posY + deltaY;
      
      newX = Math.max(0, Math.min(newX, bounds.width - panelWidth));
      newY = Math.max(0, Math.min(newY, bounds.height - panelHeight));
      
      // Store as offset from original position
      setDragOffset({ 
        x: newX - position.x, 
        y: newY - position.y 
      });
    };

    const handleMouseUp = () => {
      // Commit the final position
      const finalX = position.x + dragOffset.x;
      const finalY = position.y + dragOffset.y;
      
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
      endUICapture();
      onStateChange({ x: finalX, y: finalY });
      
      if (didDragRef.current) {
        if (dragPreventClickTimeoutRef.current) {
          clearTimeout(dragPreventClickTimeoutRef.current);
        }
        dragPreventClickTimeoutRef.current = setTimeout(() => {
          didDragRef.current = false;
        }, 100);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, dragOffset, position.x, position.y, currentWidth, getBounds, onStateChange]);

  // Handle resize move - supports width, height, or both
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;
      
      let newWidthOffset = 0;
      let newHeightOffset = 0;
      let newWidth = resizeStartRef.current.width;
      let newHeight = resizeStartRef.current.height;
      
      // Handle width resize
      if (isResizingWidth || isResizingBoth) {
        newWidth = resizeStartRef.current.width + deltaX;
        
        // Apply snap if specified
        if (resizeSnapWidth) {
          const units = Math.round(newWidth / resizeSnapWidth);
          newWidth = units * resizeSnapWidth;
        }
        
        // Constrain to min/max
        newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        newWidthOffset = newWidth - resizeStartRef.current.width;
      }
      
      // Handle height resize
      if ((isResizingHeight || isResizingBoth) && defaultHeight) {
        newHeight = resizeStartRef.current.height + deltaY;
        
        // Constrain to min/max
        newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
        newHeightOffset = newHeight - resizeStartRef.current.height;
      }
      
      setResizeWidthOffset(newWidthOffset);
      setResizeHeightOffset(newHeightOffset);
      
      // Call onResizing for real-time feedback
      if (onResizing) {
        onResizing(newWidth, defaultHeight ? newHeight : undefined);
      }
    };

    const handleMouseUp = () => {
      // Commit the final dimensions
      const changes: Partial<PanelState> = {};
      
      if (isResizingWidth || isResizingBoth) {
        changes.width = resizeStartRef.current.width + resizeWidthOffset;
      }
      if ((isResizingHeight || isResizingBoth) && defaultHeight) {
        changes.height = resizeStartRef.current.height + resizeHeightOffset;
      }
      
      setIsResizingWidth(false);
      setIsResizingHeight(false);
      setIsResizingBoth(false);
      setResizeWidthOffset(0);
      setResizeHeightOffset(0);
      endUICapture();
      onStateChange(changes);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    
    // Set appropriate cursor
    if (isResizingBoth) {
      document.body.style.cursor = 'nwse-resize';
    } else if (isResizingHeight) {
      document.body.style.cursor = 'ns-resize';
    } else {
      document.body.style.cursor = 'ew-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, isResizingWidth, isResizingHeight, isResizingBoth, resizeWidthOffset, resizeHeightOffset, minWidth, maxWidth, minHeight, maxHeight, defaultHeight, resizeSnapWidth, onStateChange, onResizing]);

  useEffect(() => {
    return () => {
      if (dragPreventClickTimeoutRef.current) {
        clearTimeout(dragPreventClickTimeoutRef.current);
      }
    };
  }, []);

  // Track previous bounds for relative positioning
  const prevBoundsRef = useRef<{ width: number; height: number } | null>(null);
  
  // Constrain panel to bounds on resize/bounds change with smarter repositioning
  useEffect(() => {
    const handleBoundsChange = () => {
      if (!boundsRef?.current || !panelRef.current) return;
      
      const bounds = getBounds();
      const panelWidth = panelRef.current.offsetWidth;
      const panelHeight = panelRef.current.offsetHeight;
      
      const currentX = position.x + dragOffset.x;
      const currentY = position.y + dragOffset.y;
      
      let newX = currentX;
      let newY = currentY;
      
      // If we have previous bounds and size changed, apply anchor-based repositioning
      if (prevBoundsRef.current) {
        const prevBounds = prevBoundsRef.current;
        const widthDiff = bounds.width - prevBounds.width;
        
        // For right-anchored panels, adjust X position based on width change
        if (anchor === 'right' || anchor === 'top-right' || anchor === 'bottom-right') {
          newX = currentX + widthDiff;
        }
        // Left-anchored panels stay in place (no adjustment needed)
        // For non-anchored panels, apply proportional repositioning
        else if (anchor === 'none' && widthDiff !== 0) {
          // Keep panel at same relative horizontal position
          const relativeX = currentX / prevBounds.width;
          newX = relativeX * bounds.width;
        }
      }
      
      // Constrain to bounds
      if (newX + panelWidth > bounds.width) {
        newX = Math.max(0, bounds.width - panelWidth);
      }
      newX = Math.max(0, newX);
      
      if (newY + panelHeight > bounds.height) {
        newY = Math.max(0, bounds.height - panelHeight);
      }
      newY = Math.max(0, newY);
      
      // Update previous bounds
      prevBoundsRef.current = { width: bounds.width, height: bounds.height };
      
      // Update if position changed
      if (newX !== currentX || newY !== currentY) {
        setDragOffset({ x: 0, y: 0 });
        onStateChange({ x: newX, y: newY });
      }
    };
    
    // Initialize previous bounds
    if (!prevBoundsRef.current && boundsRef?.current) {
      const bounds = getBounds();
      prevBoundsRef.current = { width: bounds.width, height: bounds.height };
    }
    
    // Watch for window resize
    window.addEventListener('resize', handleBoundsChange);
    
    // Watch for bounds container resize
    const resizeObserver = new ResizeObserver(handleBoundsChange);
    if (boundsRef?.current) {
      resizeObserver.observe(boundsRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleBoundsChange);
      resizeObserver.disconnect();
    };
  }, [position.x, position.y, dragOffset.x, dragOffset.y, boundsRef, anchor, onStateChange, getBounds]);

  const toggleCollapse = useCallback(() => {
    onStateChange({ collapsed: !position.collapsed });
  }, [position.collapsed, onStateChange]);

  const handleHeaderClick = useCallback(() => {
    if (didDragRef.current) {
      return;
    }
    if (position.collapsed) {
      toggleCollapse();
    }
  }, [position.collapsed, toggleCollapse]);

  const handlePanelClick = useCallback(() => {
    setIsFocused(true);
    // Bring panel to front when clicked
    onBringToFront?.();
  }, [onBringToFront]);

  const getCollapseIcon = () => {
    if (position.collapsed) {
      if (anchor === 'left' || anchor === 'top-left' || anchor === 'bottom-left') {
        return <ChevronRightIcon className="w-4 h-4" />;
      }
      if (anchor === 'right' || anchor === 'top-right' || anchor === 'bottom-right') {
        return <ChevronLeftIcon className="w-4 h-4" />;
      }
      return <ChevronDownIcon className="w-4 h-4" />;
    }
    return <ChevronUpIcon className="w-4 h-4" />;
  };

  return (
    <div
      ref={panelRef}
      id={`panel-${id}`}
      data-ui-element="true"
      data-floating-panel="true"
      className={`
        absolute floating-panel
        backdrop-blur-md
        rounded-lg
        shadow-2xl
        transition-shadow duration-200
        ${isDark 
          ? 'bg-gray-900/95 border-gray-700/60' 
          : 'bg-white/95 border-gray-300/60'
        }
        border
        ${isDragging ? 'shadow-xl shadow-primary-500/20' : ''}
        ${isFocused ? 'ring-1 ring-primary-500/30' : ''}
      `}
      style={{
        left: currentX,
        top: currentY,
        width: currentWidth, // Always maintain width, even when collapsed
        minWidth: minWidth,
        zIndex: isDragging || isResizing ? zIndex + 10 : (isFocused ? zIndex + 5 : zIndex),
      }}
      onClick={handlePanelClick}
      onMouseDown={handleMouseDown}
    >
      {/* Header - drag handle */}
      <div
        ref={headerRef}
        className={`
          flex items-center justify-between
          px-3 py-2
          border-b
          rounded-t-lg
          ${!position.collapsed ? 'cursor-grab' : 'cursor-pointer'}
          ${isDragging ? 'cursor-grabbing' : ''}
          select-none
          ${isDark
            ? 'bg-gray-800/60 border-gray-700/40'
            : 'bg-gray-100/80 border-gray-200/60'
          }
        `}
        onClick={handleHeaderClick}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="flex-shrink-0 text-primary-500">
              {icon}
            </span>
          )}
          <span className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            {title}
          </span>
        </div>
        
        <div className="flex items-center gap-0.5">
          <button
            className={`p-1 rounded transition-colors ${
              isDark 
                ? 'hover:bg-gray-700/50 text-gray-400 hover:text-gray-200' 
                : 'hover:bg-gray-200/80 text-gray-500 hover:text-gray-700'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
            title={position.collapsed ? 'Expand' : 'Collapse'}
          >
            {getCollapseIcon()}
          </button>
          {closable && onClose && (
            <button
              className={`p-1 rounded transition-colors ${
                isDark 
                  ? 'hover:bg-red-600/30 text-gray-400 hover:text-red-400' 
                  : 'hover:bg-red-100 text-gray-500 hover:text-red-600'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Close panel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content - scrollable with themed scrollbar */}
      <div
        className={`
          transition-all duration-200 ease-out
          ${position.collapsed ? 'max-h-0 opacity-0 pointer-events-none overflow-hidden' : 'opacity-100 overflow-y-auto overflow-x-hidden'}
        `}
        style={{ 
          // Use explicit height if resizable and set, otherwise max-height
          ...(currentHeight && !position.collapsed ? {
            height: currentHeight - 44, // Subtract header height (~44px)
          } : {
            maxHeight: position.collapsed ? 0 : maxHeight,
          }),
          // Themed scrollbar styling
          ...(!position.collapsed && {
            scrollbarWidth: 'thin',
            scrollbarColor: isDark 
              ? 'rgba(156, 163, 175, 0.5) rgba(31, 41, 55, 0.3)'
              : 'rgba(107, 114, 128, 0.5) rgba(229, 231, 235, 0.5)',
          }),
        }}
      >
        <div className="p-3">
          {typeof children === 'function' ? children(currentWidth, currentHeight ?? maxHeight) : children}
        </div>
      </div>
      
      {/* Webkit scrollbar styles */}
      {!position.collapsed && (
        <style>{`
          #panel-${id} > div:nth-child(2)::-webkit-scrollbar {
            width: 8px;
          }
          #panel-${id} > div:nth-child(2)::-webkit-scrollbar-track {
            background: ${isDark ? 'rgba(31, 41, 55, 0.3)' : 'rgba(229, 231, 235, 0.5)'};
            border-radius: 4px;
          }
          #panel-${id} > div:nth-child(2)::-webkit-scrollbar-thumb {
            background: ${isDark ? 'rgba(156, 163, 175, 0.5)' : 'rgba(107, 114, 128, 0.5)'};
            border-radius: 4px;
          }
          #panel-${id} > div:nth-child(2)::-webkit-scrollbar-thumb:hover {
            background: ${isDark ? 'rgba(156, 163, 175, 0.7)' : 'rgba(107, 114, 128, 0.7)'};
          }
        `}</style>
      )}

      {/* Horizontal resize handle (right edge) */}
      {resizable && !position.collapsed && (
        <div
          className={`
            absolute right-0 top-0 w-2 cursor-ew-resize
            hover:bg-primary-500/20 transition-colors
          `}
          style={{ bottom: resizableHeight ? 8 : 0 }}
          onMouseDown={handleResizeWidthStart}
        />
      )}
      
      {/* Vertical resize handle (bottom edge) */}
      {resizableHeight && !position.collapsed && (
        <div
          className={`
            absolute bottom-0 left-0 h-2 cursor-ns-resize
            hover:bg-primary-500/20 transition-colors
          `}
          style={{ right: resizable ? 8 : 0 }}
          onMouseDown={handleResizeHeightStart}
        />
      )}
      
      {/* Corner resize handle (both) */}
      {resizable && resizableHeight && !position.collapsed && (
        <div
          className={`
            absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize
            hover:bg-primary-500/30 transition-colors
            rounded-br-lg
          `}
          onMouseDown={handleResizeBothStart}
        >
          {/* Resize grip visual */}
          <svg 
            className={`w-3 h-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} 
            viewBox="0 0 12 12" 
            fill="currentColor"
          >
            <circle cx="9" cy="9" r="1.5" />
            <circle cx="5" cy="9" r="1.5" />
            <circle cx="9" cy="5" r="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default FloatingPanel;
