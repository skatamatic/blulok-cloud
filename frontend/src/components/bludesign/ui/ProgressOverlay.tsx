/**
 * Progress Overlay
 * 
 * Beautiful progress overlay for time-consuming operations in BluDesign.
 * Dims the render area and shows contextual progress with accurate percentage.
 * Designed to be minimalist, clean, and theme-aware.
 */

import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

export interface ProgressState {
  percentage: number;
  message: string;
  isVisible: boolean;
}

interface ProgressOverlayProps {
  progress: ProgressState | null;
  /** Minimum time in ms overlay stays visible once shown (prevents flickering) */
  minDisplayTime?: number;
}

/** Minimum display time reduced for better responsiveness */
const DEFAULT_MIN_DISPLAY_TIME = 150;

/** Fixed progress bar width for consistent sizing */
const PROGRESS_BAR_WIDTH = 320;

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  progress,
  minDisplayTime = DEFAULT_MIN_DISPLAY_TIME,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [isRendered, setIsRendered] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [canHide, setCanHide] = useState(true);
  const showTimeRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVisible = progress?.isVisible ?? false;
  const percentage = Math.min(100, Math.max(0, progress?.percentage ?? 0));
  const message = progress?.message || 'Processing...';

  // Track when overlay becomes visible to enforce minimum display time
  useEffect(() => {
    if (isVisible) {
      if (showTimeRef.current === null) {
        showTimeRef.current = Date.now();
        setCanHide(false);
      }
      
      setIsRendered(true);
      // Immediately show overlay (no delay)
      requestAnimationFrame(() => {
        setFadeIn(true);
      });
      
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else {
      // Only enforce minimum display time if we haven't been visible for long
      // For completed operations (100%), hide immediately
      const visibleDuration = showTimeRef.current ? Date.now() - showTimeRef.current : 0;
      const shouldHideImmediately = percentage >= 100 || visibleDuration > 200; // Hide quickly if complete or visible > 200ms
      
      if (shouldHideImmediately) {
        setFadeIn(false);
        const timer = setTimeout(() => {
          setIsRendered(false);
          showTimeRef.current = null;
        }, 300);
        return () => clearTimeout(timer);
      } else {
        // Very short minimum display time for incomplete operations
        const remainingTime = Math.max(0, minDisplayTime - visibleDuration);
        if (remainingTime > 0 && !canHide) {
          hideTimeoutRef.current = setTimeout(() => {
            setCanHide(true);
            setFadeIn(false);
            const timer = setTimeout(() => {
              setIsRendered(false);
              showTimeRef.current = null;
            }, 300);
            return () => clearTimeout(timer);
          }, remainingTime);
        } else {
          setFadeIn(false);
          const timer = setTimeout(() => {
            setIsRendered(false);
            showTimeRef.current = null;
          }, 300);
          return () => clearTimeout(timer);
        }
      }
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isVisible, canHide, minDisplayTime]);

  if (!isRendered) return null;

  const isComplete = percentage >= 100;

  // Theme-aware colors - using company theme colors (147FD4 blue, 050505 dark)
  
  const overlayBg = isDark
    ? `linear-gradient(to bottom, rgba(5, 5, 5, 0.85) 0%, rgba(17, 24, 39, 0.90) 100%)`
    : `linear-gradient(to bottom, rgba(248, 250, 252, 0.85) 0%, rgba(241, 245, 249, 0.90) 100%)`;

  const gridColor = isDark ? 'rgba(20, 127, 212, 0.08)' : 'rgba(20, 127, 212, 0.05)';

  return (
    <div
      className={`absolute inset-0 z-[9998] flex items-center justify-center transition-opacity duration-300 pointer-events-none ${
        fadeIn ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ 
        background: overlayBg,
        backdropFilter: 'blur(2px)',
      }}
    >
      {/* Subtle Grid Background */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(${gridColor} 1px, transparent 1px),
            linear-gradient(90deg, ${gridColor} 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center">
        
        {/* Icon container */}
        <div className={`relative mb-6 ${
          isDark 
            ? 'bg-gray-900/60 border-primary-500/30' 
            : 'bg-white/70 border-primary-300'
        } w-16 h-16 rounded-xl flex items-center justify-center border backdrop-blur-sm transition-all duration-300`}>
          {/* Animated cube icon */}
          <svg 
            viewBox="0 0 48 48" 
            className={`w-8 h-8 transition-colors duration-300 ${
              isDark ? 'text-primary-400' : 'text-primary-600'
            }`}
            style={{
              animation: isComplete ? 'none' : 'pulse-subtle 2s ease-in-out infinite',
            }}
          >
            {/* 3D Cube representing building/design */}
            <path 
              fill="currentColor" 
              fillOpacity="0.2"
              d="M24 4L6 14v20l18 10 18-10V14L24 4z"
            />
            <path 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              d="M24 4L6 14v20l18 10 18-10V14L24 4z M24 24L6 14 M24 24l18-10 M24 24v20"
            />
          </svg>
          
          {/* Success checkmark overlay */}
          {isComplete && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg 
                viewBox="0 0 24 24" 
                className="w-6 h-6 text-green-500"
                style={{ animation: 'check-appear 0.4s ease-out forwards' }}
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
                    animation: 'draw-check 0.4s ease-out 0.1s forwards',
                  }}
                />
              </svg>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div 
          className={`relative h-1.5 rounded-full overflow-hidden mb-4 transition-all duration-300 ${
            isDark ? 'bg-gray-800/60' : 'bg-gray-200/80'
          }`}
          style={{ width: PROGRESS_BAR_WIDTH }}
        >
          {/* Progress Fill */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out ${
              isComplete
                ? 'bg-green-500'
                : isDark 
                  ? 'bg-gradient-to-r from-primary-600 to-primary-400'
                  : 'bg-gradient-to-r from-primary-500 to-primary-400'
            }`}
            style={{ width: `${percentage}%` }}
          />
          
          {/* Animated shimmer effect during loading */}
          {!isComplete && (
            <div 
              className="absolute inset-0 overflow-hidden rounded-full"
              style={{ width: `${percentage}%` }}
            >
              <div 
                className={`h-full w-full ${
                  isDark 
                    ? 'bg-gradient-to-r from-transparent via-white/20 to-transparent' 
                    : 'bg-gradient-to-r from-transparent via-white/40 to-transparent'
                }`}
                style={{ 
                  animation: 'shimmer 1.5s ease-in-out infinite',
                }}
              />
            </div>
          )}
        </div>

        {/* Percentage Display */}
        <div className={`text-2xl font-bold mb-2 tabular-nums transition-colors duration-300 ${
          isComplete
            ? isDark ? 'text-green-400' : 'text-green-600'
            : isDark ? 'text-white' : 'text-gray-900'
        }`}>
          {Math.round(percentage)}%
        </div>

        {/* Message */}
        <p className={`text-sm text-center max-w-xs transition-colors duration-300 ${
          isDark ? 'text-gray-400' : 'text-gray-600'
        }`}>
          {message}
        </p>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        
        @keyframes pulse-subtle {
          0%, 100% { 
            transform: scale(1); 
            opacity: 1; 
          }
          50% { 
            transform: scale(1.05); 
            opacity: 0.85; 
          }
        }
        
        @keyframes check-appear {
          0% { 
            transform: scale(0); 
            opacity: 0; 
          }
          100% { 
            transform: scale(1); 
            opacity: 1; 
          }
        }
        
        @keyframes draw-check {
          to { 
            stroke-dashoffset: 0; 
          }
        }
      `}</style>
    </div>
  );
};

export default ProgressOverlay;

