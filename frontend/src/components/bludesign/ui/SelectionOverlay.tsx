/**
 * Selection Overlay
 * 
 * 2D overlay for drag selection box (marquee selection).
 * Note: 3D selection highlights are handled by SelectionHighlightManager in the engine.
 */

import React, { useEffect, useRef, useMemo } from 'react';

interface Point2D {
  x: number;
  y: number;
}

interface SelectionBox {
  start: Point2D;
  end: Point2D;
}

interface SelectionOverlayProps {
  /** Whether selection overlay is active */
  isActive: boolean;
  /** Current drag selection box (null if not dragging) */
  selectionBox: SelectionBox | null;
  /** Container dimensions for clipping */
  containerWidth: number;
  containerHeight: number;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  isActive,
  selectionBox,
  containerWidth,
  containerHeight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const dashOffsetRef = useRef<number>(0);
  
  // Drag box style configuration
  const dragBoxConfig = useMemo(() => ({
    fillColor: 'rgba(255, 184, 0, 0.08)',
    strokeColor: '#FFB800',
    strokeWidth: 1.5,
    dashLength: 6,
    gapLength: 4,
    animationSpeed: 60, // pixels per second
  }), []);

  // Calculate selection box dimensions
  const boxDimensions = useMemo(() => {
    if (!selectionBox) return null;
    
    const left = Math.min(selectionBox.start.x, selectionBox.end.x);
    const top = Math.min(selectionBox.start.y, selectionBox.end.y);
    const width = Math.abs(selectionBox.end.x - selectionBox.start.x);
    const height = Math.abs(selectionBox.end.y - selectionBox.start.y);
    
    return { left, top, width, height };
  }, [selectionBox]);

  // Main rendering effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    ctx.scale(dpr, dpr);
    
    let lastTime = performance.now();
    
    const render = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000; // in seconds
      lastTime = currentTime;
      
      // Update dash offset for animation
      dashOffsetRef.current -= dragBoxConfig.animationSpeed * deltaTime;
      
      // Clear canvas
      ctx.clearRect(0, 0, containerWidth, containerHeight);
      
      // Draw drag selection box (marquee)
      if (boxDimensions && boxDimensions.width > 2 && boxDimensions.height > 2) {
        ctx.save();
        
        // Fill
        ctx.fillStyle = dragBoxConfig.fillColor;
        ctx.fillRect(
          boxDimensions.left,
          boxDimensions.top,
          boxDimensions.width,
          boxDimensions.height
        );
        
        // Stroke with animated dash
        ctx.strokeStyle = dragBoxConfig.strokeColor;
        ctx.lineWidth = dragBoxConfig.strokeWidth;
        ctx.setLineDash([dragBoxConfig.dashLength, dragBoxConfig.gapLength]);
        ctx.lineDashOffset = dashOffsetRef.current;
        ctx.strokeRect(
          boxDimensions.left,
          boxDimensions.top,
          boxDimensions.width,
          boxDimensions.height
        );
        
        ctx.restore();
      }
      
      // Continue animation loop if there's something to animate
      if (boxDimensions) {
        animationRef.current = requestAnimationFrame(render);
      }
    };
    
    // Start animation if we have a selection box
    if (boxDimensions) {
      animationRef.current = requestAnimationFrame(render);
    } else {
      // Clear canvas when no selection box
      ctx.clearRect(0, 0, containerWidth, containerHeight);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [containerWidth, containerHeight, boxDimensions, dragBoxConfig]);

  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: containerWidth,
        height: containerHeight,
        zIndex: 50, // Ensure it's above 3D content
      }}
    />
  );
};
