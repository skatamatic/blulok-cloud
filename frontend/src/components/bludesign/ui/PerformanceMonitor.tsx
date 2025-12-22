/**
 * Performance Monitor
 * 
 * Displays FPS counter and GPU memory information when enabled in settings.
 * Only renders when settings enable it.
 */

import { useEffect, useState, useRef } from 'react';
import { RenderingSettingsManager } from '../core/RenderingSettingsManager';

export const PerformanceMonitor: React.FC = () => {
  const [fps, setFps] = useState(0);
  const [gpuInfo, setGpuInfo] = useState<string>('N/A');
  const settings = RenderingSettingsManager.getInstance();
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animationFrameRef = useRef<number>();
  const settingsUnsubscribeRef = useRef<(() => void) | null>(null);
  const [showFPS, setShowFPS] = useState(settings.shouldShowFPS());
  const [showGPUMemory, setShowGPUMemory] = useState(settings.shouldShowGPUMemory());
  
  // Subscribe to settings changes
  useEffect(() => {
    settingsUnsubscribeRef.current = settings.onSettingsChange(() => {
      setShowFPS(settings.shouldShowFPS());
      setShowGPUMemory(settings.shouldShowGPUMemory());
    });
    
    return () => {
      if (settingsUnsubscribeRef.current) {
        settingsUnsubscribeRef.current();
      }
    };
  }, [settings]);
  
  // FPS tracking
  useEffect(() => {
    if (!showFPS && !showGPUMemory) {
      return;
    }
    
    const update = () => {
      if (showFPS) {
        frameCountRef.current++;
        const now = performance.now();
        if (now - lastTimeRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastTimeRef.current = now;
        }
      }
      
      if (showGPUMemory) {
        // Try to get GPU info (if available)
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (gl) {
            // @ts-ignore - experimental API
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
              const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
              // Memory info not directly available, but we can show renderer info
              if (renderer) {
                setGpuInfo(renderer.length > 40 ? renderer.substring(0, 40) + '...' : renderer);
              }
            } else {
              // Fallback: try to get basic info
              const renderer = gl.getParameter(gl.RENDERER);
              if (renderer) {
                setGpuInfo(renderer.length > 40 ? renderer.substring(0, 40) + '...' : renderer);
              }
            }
          }
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(update);
    };
    
    animationFrameRef.current = requestAnimationFrame(update);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [showFPS, showGPUMemory]);
  
  if (!showFPS && !showGPUMemory) {
    return null;
  }
  
  return (
    <div className="fixed top-4 right-4 z-50 bg-black/80 text-white text-xs font-mono p-2 rounded backdrop-blur-sm">
      {showFPS && (
        <div className="mb-1">
          <span className="text-gray-400">FPS:</span>{' '}
          <span className={fps >= 60 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}>
            {fps}
          </span>
        </div>
      )}
      {showGPUMemory && (
        <div>
          <span className="text-gray-400">GPU:</span>{' '}
          <span className="text-blue-400">{gpuInfo}</span>
        </div>
      )}
    </div>
  );
};

