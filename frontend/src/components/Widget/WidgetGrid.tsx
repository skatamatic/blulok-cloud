// src/components/Widget/WidgetGrid.tsx

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { AnimatePresence } from 'framer-motion';

const ResponsiveGridLayout = WidthProvider(Responsive);

export interface WidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

interface WidgetGridProps {
  children: React.ReactNode[];
  layouts: { [key: string]: WidgetLayout[] };
  onLayoutChange?: (layout: Layout[], layouts: { [key: string]: Layout[] }) => void;
  onLayoutSave?: (layouts: { [key: string]: Layout[] }) => void;
  isDraggable?: boolean;
  isResizable?: boolean;
  className?: string;
  enableAutoScroll?: boolean;
}

export const WidgetGrid: React.FC<WidgetGridProps> = ({
  children,
  layouts,
  onLayoutChange,
  onLayoutSave,
  isDraggable = true,
  isResizable = true,
  className = '',
  enableAutoScroll = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollDelayRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  
  // Save to window storage for immediate persistence
  const saveToWindowStorage = useCallback((layouts: { [key: string]: Layout[] }) => {
    try {
      window.localStorage.setItem('blulok-widget-layouts', JSON.stringify(layouts));
    } catch (error) {
      console.warn('Failed to save layouts to window storage:', error);
    }
  }, []);

  
  // Track drag state for smart swapping
  const dragStateRef = useRef<{
    draggedItem: Layout | null;
    startPosition: { x: number; y: number } | null;
    hasSwapped: boolean;
  }>({
    draggedItem: null,
    startPosition: null,
    hasSwapped: false
  });

  // Tweaked to require substantially smaller window before switching layouts
  // Aligns roughly with Tailwind: lg 1024, md 768, sm 640
  const breakpoints = { lg: 1024, md: 768, sm: 640, xs: 480, xxs: 0 };
  const cols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

  // Smart widget swapping for horizontal drags
  const detectHorizontalSwap = useCallback((newLayout: Layout[]): Layout[] => {
    const dragState = dragStateRef.current;
    if (!dragState.draggedItem || !dragState.startPosition) {
      return newLayout;
    }

    // Find the current dragged item
    const currentDraggedItem = newLayout.find(item => item.i === dragState.draggedItem!.i);
    if (!currentDraggedItem) return newLayout;

    // Calculate if this is primarily horizontal movement
    const horizontalDistance = Math.abs(currentDraggedItem.x - dragState.startPosition.x);
    const verticalDistance = Math.abs(currentDraggedItem.y - dragState.startPosition.y);
    
    // Only proceed if this is a horizontal drag with minimal vertical movement
    if (horizontalDistance <= 1 || verticalDistance > 1) {
      return newLayout;
    }

    // Find potential swap candidates
    const swapCandidates = newLayout.filter(item => {
      if (item.i === currentDraggedItem.i) return false;
      
      // Must be same size to swap
      if (item.w !== dragState.draggedItem!.w || item.h !== dragState.draggedItem!.h) {
        return false;
      }
      
      // Must be on the same row or very close
      const rowDifference = Math.abs(item.y - dragState.startPosition!.y);
      if (rowDifference > 0.5) return false;
      
      // Check if it's horizontally aligned with where we're trying to place the dragged item
      const targetX = currentDraggedItem.x;
      const itemOverlap = (targetX < item.x + item.w) && (targetX + currentDraggedItem.w > item.x);
      
      return itemOverlap;
    });

    if (swapCandidates.length === 1) {
      const swapTarget = swapCandidates[0];
      
      // Create the swapped layout
      return newLayout.map(item => {
        if (item.i === currentDraggedItem.i) {
          return { ...item, x: swapTarget.x, y: swapTarget.y };
        } else if (item.i === swapTarget.i) {
          return { ...item, x: dragState.startPosition!.x, y: dragState.startPosition!.y };
        }
        return item;
      });
    }

    return newLayout;
  }, []);

  const gridProps = useMemo(() => ({
    className: `widget-grid ${className}`,
    layouts,
    breakpoints,
    cols,
    rowHeight: 120,
    isDraggable,
    isResizable: isResizable ?? false, // Use prop or disable resize handles - use dropdown instead
    margin: [16, 16] as [number, number],
    containerPadding: [0, 0] as [number, number],
    useCSSTransforms: true,
    preventCollision: false,
    compactType: 'vertical' as const,
    onLayoutChange: (layout: Layout[], layouts: { [key: string]: Layout[] }) => {
      // Apply smart horizontal swapping if dragging
      let finalLayout = layout;
      let finalLayouts = layouts;
      
      if (isDragging && !dragStateRef.current.hasSwapped) {
        const swappedLayout = detectHorizontalSwap(layout);
        if (swappedLayout !== layout) {
          finalLayout = swappedLayout;
          // Update the layouts object with the swapped layout for the current breakpoint
          finalLayouts = { 
            ...layouts,
            lg: swappedLayout // Update the main breakpoint
          };
          dragStateRef.current.hasSwapped = true;
        }
      }
      
      onLayoutChange?.(finalLayout, finalLayouts);
      
      // Save to window storage immediately for instant persistence
      saveToWindowStorage(finalLayouts);
      
      // Debounced save to backend (only if not initial load)
      if (onLayoutSave && !isInitialLoadRef.current) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          onLayoutSave(finalLayouts);
        }, 500); // Reduced to 500ms for faster backend sync
      }
      
      // Mark as no longer initial load after first change
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
    },
    onDragStart: (_layout: Layout[], oldItem: Layout, _newItem: Layout, _placeholder: Layout, e: MouseEvent) => {
      setIsDragging(true);
      
      // Initialize drag state for smart collision detection
      dragStateRef.current = {
        draggedItem: { ...oldItem },
        startPosition: { x: oldItem.x, y: oldItem.y },
        hasSwapped: false
      };
      
      if (enableAutoScroll) {
        startAutoScroll(e);
      }
    },
    onDrag: (_layout: Layout[], _oldItem: Layout, _newItem: Layout, _placeholder: Layout, e: MouseEvent) => {
      if (enableAutoScroll) {
        updateAutoScroll(e);
      }
    },
    onDragStop: (_layout: Layout[]) => {
      setIsDragging(false);
      stopAutoScroll();
      
      // Reset drag state
      dragStateRef.current = {
        draggedItem: null,
        startPosition: null,
        hasSwapped: false
      };
    },
    draggableHandle: '.drag-handle',
    cancel: '.no-drag, button, input, select, textarea, .widget-content, .widget-body, .card > *:not(.drag-handle)',
    transformScale: 1,
  }), [layouts, onLayoutChange, onLayoutSave, isDraggable, className, enableAutoScroll, isDragging, detectHorizontalSwap]);

  // Auto-scroll functions
  const startAutoScroll = (e: MouseEvent) => {
    updateAutoScroll(e);
  };

  const updateAutoScroll = (e: MouseEvent) => {
    const scrollThreshold = 80; // Pixels from edge to trigger scroll
    const scrollSpeed = 8; // Pixels per scroll step
    const scrollDelay = 500; // 500ms delay before starting scroll
    const windowHeight = window.innerHeight;
    
    // Use mouse position relative to viewport
    const mouseY = e.clientY;

    // Clear existing intervals
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    if (scrollDelayRef.current) {
      clearTimeout(scrollDelayRef.current);
      scrollDelayRef.current = null;
    }

    // Check if we should trigger auto-scroll
    const shouldScrollUp = mouseY < scrollThreshold && window.scrollY > 0;
    const shouldScrollDown = mouseY > windowHeight - scrollThreshold && 
                           window.scrollY < (document.documentElement.scrollHeight - window.innerHeight);

    if (shouldScrollUp || shouldScrollDown) {
      // Start scrolling after delay
      scrollDelayRef.current = setTimeout(() => {
        if (shouldScrollUp) {
          scrollIntervalRef.current = setInterval(() => {
            if (window.scrollY > 0) {
              window.scrollBy(0, -scrollSpeed);
            } else {
              stopAutoScroll();
            }
          }, 16); // ~60fps
        } else if (shouldScrollDown) {
          scrollIntervalRef.current = setInterval(() => {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            if (window.scrollY < maxScroll) {
              window.scrollBy(0, scrollSpeed);
            } else {
              stopAutoScroll();
            }
          }, 16); // ~60fps
        }
      }, scrollDelay);
    }
  };

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    if (scrollDelayRef.current) {
      clearTimeout(scrollDelayRef.current);
      scrollDelayRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  
  // Check if we have valid layouts
  if (!layouts.lg || layouts.lg.length === 0) {
    console.error('WARNING: No lg layout provided to WidgetGrid!');
  }

  return (
    <div 
      ref={containerRef}
      className={`relative ${isDragging ? 'select-none dragging' : ''}`}
    >
      <AnimatePresence>
        <ResponsiveGridLayout {...gridProps}>
          {children}
        </ResponsiveGridLayout>
      </AnimatePresence>
    </div>
  );
};