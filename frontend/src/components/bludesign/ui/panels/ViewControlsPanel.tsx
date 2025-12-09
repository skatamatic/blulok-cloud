/**
 * View Controls Panel
 * 
 * Camera mode, rotation, and view settings.
 * Renders as embedded content - wrap with FloatingPanel for standalone use.
 */

import React from 'react';
import {
  CubeIcon,
  CubeTransparentIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowsPointingOutIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/outline';
import { CameraMode, IsometricAngle } from '../../core/types';
import { useTheme } from '@/contexts/ThemeContext';

interface ViewControlsPanelProps {
  cameraMode: CameraMode;
  isometricAngle: IsometricAngle | number;
  showGrid: boolean;
  showCallouts: boolean;
  onCameraModeChange: (mode: CameraMode) => void;
  onRotateIsometric: (direction: 'cw' | 'ccw') => void;
  onToggleGrid: () => void;
  onToggleCallouts: () => void;
  onResetCamera: () => void;
}

export const ViewControlsPanel: React.FC<ViewControlsPanelProps> = ({
  cameraMode,
  isometricAngle,
  showGrid,
  showCallouts,
  onCameraModeChange,
  onRotateIsometric,
  onToggleGrid,
  onToggleCallouts,
  onResetCamera,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const getAngleLabel = (angle: number): string => {
    if (angle === 45 || angle === IsometricAngle.NORTH_EAST) return 'NE';
    if (angle === 135 || angle === IsometricAngle.SOUTH_EAST) return 'SE';
    if (angle === 225 || angle === IsometricAngle.SOUTH_WEST) return 'SW';
    if (angle === 315 || angle === IsometricAngle.NORTH_WEST) return 'NW';
    return `${angle}°`;
  };

  return (
    <div className="space-y-3">
      {/* Camera Mode */}
      <div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Camera Mode
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
              cameraMode === CameraMode.FREE
                ? 'bg-primary-600 text-white'
                : isDark
                  ? 'bg-gray-700/40 text-gray-300 hover:bg-gray-600/50'
                  : 'bg-gray-200/60 text-gray-700 hover:bg-gray-300/60'
            }`}
            onClick={() => onCameraModeChange(CameraMode.FREE)}
          >
            <CubeTransparentIcon className="w-4 h-4" />
            <span>Free</span>
          </button>
          <button
            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
              cameraMode === CameraMode.ISOMETRIC
                ? 'bg-primary-600 text-white'
                : isDark
                  ? 'bg-gray-700/40 text-gray-300 hover:bg-gray-600/50'
                  : 'bg-gray-200/60 text-gray-700 hover:bg-gray-300/60'
            }`}
            onClick={() => onCameraModeChange(CameraMode.ISOMETRIC)}
          >
            <CubeIcon className="w-4 h-4" />
            <span>Isometric</span>
          </button>
        </div>
      </div>

      {/* Rotation controls - only show in isometric mode */}
      {cameraMode === CameraMode.ISOMETRIC && (
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Rotation
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              className={`p-2 rounded-md transition-colors ${
                isDark 
                  ? 'bg-gray-700/50 hover:bg-gray-600/50' 
                  : 'bg-gray-200/60 hover:bg-gray-300/60'
              }`}
              onClick={() => onRotateIsometric('ccw')}
              title="Rotate Counter-Clockwise (Q)"
            >
              <ArrowPathIcon className={`w-5 h-5 transform scale-x-[-1] ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>
            
            <div className="flex-1 text-center">
              <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {getAngleLabel(isometricAngle as number)}
              </div>
              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {isometricAngle}°
              </div>
            </div>
            
            <button
              className={`p-2 rounded-md transition-colors ${
                isDark 
                  ? 'bg-gray-700/50 hover:bg-gray-600/50' 
                  : 'bg-gray-200/60 hover:bg-gray-300/60'
              }`}
              onClick={() => onRotateIsometric('cw')}
              title="Rotate Clockwise (E)"
            >
              <ArrowPathIcon className={`w-5 h-5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>
          </div>
        </div>
      )}

      {/* Display toggles */}
      <div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Display
        </div>
        <div className="space-y-1">
          <button
            className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
              showGrid
                ? isDark ? 'bg-gray-700/60 text-white' : 'bg-gray-300/60 text-gray-900'
                : isDark ? 'bg-gray-700/30 text-gray-400 hover:bg-gray-700/40' : 'bg-gray-200/40 text-gray-500 hover:bg-gray-200/60'
            }`}
            onClick={onToggleGrid}
          >
            <ViewfinderCircleIcon className="w-4 h-4" />
            <span>{showGrid ? 'Grid Visible' : 'Grid Hidden'}</span>
          </button>
          <button
            className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
              showCallouts
                ? isDark ? 'bg-gray-700/60 text-white' : 'bg-gray-300/60 text-gray-900'
                : isDark ? 'bg-gray-700/30 text-gray-400 hover:bg-gray-700/40' : 'bg-gray-200/40 text-gray-500 hover:bg-gray-200/60'
            }`}
            onClick={onToggleCallouts}
          >
            {showCallouts ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
            <span>{showCallouts ? 'Labels Visible' : 'Labels Hidden'}</span>
          </button>
        </div>
      </div>

      {/* Reset view */}
      <button
        className={`flex items-center justify-center gap-2 w-full px-2 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
          isDark 
            ? 'bg-gray-700/40 text-gray-300 hover:bg-gray-600/50' 
            : 'bg-gray-200/60 text-gray-700 hover:bg-gray-300/60'
        }`}
        onClick={onResetCamera}
      >
        <ArrowsPointingOutIcon className="w-4 h-4" />
        <span>Reset View</span>
      </button>
    </div>
  );
};
