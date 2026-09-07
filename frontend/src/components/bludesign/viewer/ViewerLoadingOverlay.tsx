/**
 * Viewer Loading Overlay
 * 
 * Elegant loading animation for the facility viewer.
 * Simpler and more focused than the editor loading overlay.
 */

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface ViewerLoadingOverlayProps {
  isVisible: boolean;
  progress?: number; // 0-100
  message?: string;
}

export const ViewerLoadingOverlay: React.FC<ViewerLoadingOverlayProps> = ({
  isVisible,
  progress = 0,
  message = 'Loading facility...',
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [isRendered, setIsRendered] = useState(isVisible);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsRendered(true);
      requestAnimationFrame(() => {
        setFadeIn(true);
      });
    } else {
      setFadeIn(false);
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isRendered) return null;

  const percentage = Math.min(100, Math.max(0, progress));
  const isComplete = percentage >= 100;

  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        fadeIn ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: isDark
          ? 'linear-gradient(145deg, rgba(10, 10, 24, 0.95) 0%, rgba(17, 24, 39, 0.95) 100%)'
          : 'linear-gradient(145deg, rgba(248, 250, 252, 0.95) 0%, rgba(229, 231, 235, 0.95) 100%)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Subtle Grid Pattern */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(${isDark ? 'rgba(20, 127, 212, 0.05)' : 'rgba(20, 127, 212, 0.03)'} 1px, transparent 1px),
            linear-gradient(90deg, ${isDark ? 'rgba(20, 127, 212, 0.05)' : 'rgba(20, 127, 212, 0.03)'} 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Animated 3D Cube Icon */}
        <div className="relative mb-6">
          <div 
            className={`absolute inset-0 rounded-xl blur-xl transition-opacity duration-500 ${
              isComplete ? 'opacity-70' : 'opacity-40'
            }`}
            style={{
              background: isComplete 
                ? 'radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(20, 127, 212, 0.3) 0%, transparent 70%)',
              transform: 'scale(1.4)',
            }}
          />
          
          <div className={`
            relative w-16 h-16 rounded-xl flex items-center justify-center
            border backdrop-blur-sm transition-all duration-300
            ${isComplete
              ? isDark 
                ? 'bg-green-950/50 border-green-500/40' 
                : 'bg-green-50 border-green-300'
              : isDark 
                ? 'bg-gray-900/80 border-primary-500/30' 
                : 'bg-white/80 border-primary-300'
            }
          `}>
            <svg 
              viewBox="0 0 48 48" 
              className={`w-8 h-8 transition-colors duration-300 ${
                isComplete 
                  ? 'text-green-500' 
                  : isDark ? 'text-primary-400' : 'text-primary-600'
              }`}
              style={{
                animation: isComplete ? 'none' : 'pulse-viewer 2s ease-in-out infinite',
              }}
            >
              {/* Building/Facility Icon */}
              <path 
                fill="currentColor" 
                fillOpacity="0.2"
                d="M8 12h32v28H8V12z"
              />
              <path 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                d="M8 12h32v28H8V12z M8 20h32 M8 28h32 M16 12v28 M24 12v28 M32 12v28"
              />
              {/* Roof */}
              <path 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                d="M4 12L24 4l20 8"
              />
            </svg>
            
            {/* Success checkmark */}
            {isComplete && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-xl">
                <svg 
                  viewBox="0 0 24 24" 
                  className="w-6 h-6 text-green-500"
                  style={{ animation: 'check-draw 0.4s ease-out forwards' }}
                >
                  <path 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                    style={{
                      strokeDasharray: 24,
                      strokeDashoffset: 24,
                      animation: 'draw-path 0.4s ease-out 0.1s forwards',
                    }}
                  />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Progress Ring */}
        <div className="relative w-24 h-24 mb-4">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={isDark ? '#374151' : '#e5e7eb'}
              strokeWidth="6"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={isComplete ? '#22c55e' : '#147FD4'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={264}
              strokeDashoffset={264 - (264 * percentage) / 100}
              className="transition-all duration-300 ease-out"
            />
          </svg>
          {/* Percentage text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xl font-bold tabular-nums ${
              isComplete 
                ? 'text-green-500' 
                : isDark ? 'text-white' : 'text-gray-900'
            }`}>
              {Math.round(percentage)}%
            </span>
          </div>
        </div>

        {/* Message */}
        <p className={`text-sm transition-colors duration-300 ${
          isDark ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {isComplete ? 'Ready!' : message}
        </p>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse-viewer {
          0%, 100% { 
            transform: scale(1); 
            opacity: 1; 
          }
          50% { 
            transform: scale(1.05); 
            opacity: 0.8; 
          }
        }
        
        @keyframes check-draw {
          0% { 
            transform: scale(0); 
            opacity: 0; 
          }
          100% { 
            transform: scale(1); 
            opacity: 1; 
          }
        }
        
        @keyframes draw-path {
          to { 
            stroke-dashoffset: 0; 
          }
        }
      `}</style>
    </div>
  );
};

export default ViewerLoadingOverlay;


