/**
 * Performance Monitor
 * 
 * Displays FPS counter, GPU info, mesh count, and material count when enabled in settings.
 * Only renders when settings enable it.
 */

import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { RenderingSettingsManager } from '../core/RenderingSettingsManager';
import { BluDesignEngine } from '../core/BluDesignEngine';

interface PerformanceMonitorProps {
  engine: BluDesignEngine | null;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({ engine }) => {
  const [fps, setFps] = useState(0);
  const [gpuInfo, setGpuInfo] = useState<string>('N/A');
  const [meshCount, setMeshCount] = useState(0);
  const [materialCount, setMaterialCount] = useState(0);
  const settings = RenderingSettingsManager.getInstance();
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animationFrameRef = useRef<number>();
  const settingsUnsubscribeRef = useRef<(() => void) | null>(null);
  const statsUpdateIntervalRef = useRef<ReturnType<typeof setInterval>>();
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
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as
              | { UNMASKED_RENDERER_WEBGL: number }
              | null;
            if (debugInfo) {
              const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
              if (renderer) {
                setGpuInfo(renderer); // Don't truncate - let it wrap or scroll
              }
            } else {
              // Fallback: try to get basic info
              const renderer = gl.getParameter(gl.RENDERER);
              if (renderer) {
                setGpuInfo(renderer);
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
  
  // Update mesh and material counts periodically (every 2 seconds)
  useEffect(() => {
    if (!engine) return;
    
    const updateStats = () => {
      try {
        const scene = engine.getScene();
        
        // Count meshes
        let meshCountLocal = 0;
        const materialSet = new Set<THREE.Material>();
        
        scene.traverse((object) => {
          // Skip marker meshes for ground tiles - they're not renderable geometry
          // These are invisible selection/raycasting helpers (material.visible = false)
          // The actual rendering is done by InstancedMesh batches
          if (object instanceof THREE.Mesh && object.userData.isGroundTile) {
            // Skip ground tile markers entirely (they're not renderable)
            // Still count their materials though (they use shared material, but we want accurate counts)
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(mat => materialSet.add(mat));
              } else {
                materialSet.add(object.material);
              }
            }
            return;
          }
          
          // Count both Mesh and InstancedMesh (InstancedMesh extends Mesh, so check it first)
          if (object instanceof THREE.InstancedMesh || object instanceof THREE.Mesh) {
            meshCountLocal++;
            // Count materials (handle both single material and material arrays)
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(mat => materialSet.add(mat));
              } else {
                materialSet.add(object.material);
              }
            }
          }
        });
        
        setMeshCount(meshCountLocal);
        setMaterialCount(materialSet.size);
      } catch (error) {
        console.error('[PerformanceMonitor] Error updating stats:', error);
      }
    };
    
    // Update immediately
    updateStats();
    
    // Update every 2 seconds
    statsUpdateIntervalRef.current = setInterval(updateStats, 2000);
    
    return () => {
      if (statsUpdateIntervalRef.current) {
        clearInterval(statsUpdateIntervalRef.current);
      }
    };
  }, [engine]);
  
  if (!showFPS && !showGPUMemory) {
    return null;
  }
  
  return (
    <div className="fixed top-4 right-4 z-50 bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-md border border-gray-700/50 dark:border-gray-600/50 rounded-lg shadow-xl text-xs font-mono p-3 space-y-1.5 min-w-[180px] max-w-[320px]">
      {showFPS && (
        <div className="flex items-center justify-between">
          <span className="text-gray-400 dark:text-gray-500">FPS</span>
          <span className={`font-semibold ${
            fps >= 60 ? 'text-green-400 dark:text-green-500' : 
            fps >= 30 ? 'text-yellow-400 dark:text-yellow-500' : 
            'text-red-400 dark:text-red-500'
          }`}>
            {fps}
          </span>
        </div>
      )}
      {showGPUMemory && (
        <div className="flex items-start justify-between gap-2">
          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">GPU</span>
          <span className="text-blue-400 dark:text-blue-500 text-right break-words" title={gpuInfo}>
            {gpuInfo}
          </span>
        </div>
      )}
      {engine && (
        <>
          <div className="flex items-center justify-between pt-1 border-t border-gray-700/50 dark:border-gray-600/50">
            <span className="text-gray-400 dark:text-gray-500">Meshes</span>
            <span className="text-cyan-400 dark:text-cyan-500 font-semibold">
              {meshCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 dark:text-gray-500">Materials</span>
            <span className="text-purple-400 dark:text-purple-500 font-semibold">
              {materialCount.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

