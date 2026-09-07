/**
 * Loading Overlay
 * 
 * Elegant loading overlay for BluDesign with smooth animations.
 * Clean, minimal design focused on progress and a subtle message.
 */

import React, { useEffect, useState, useRef } from 'react';
import { LoadingProgress } from '../loading/LoadingManager';
import { useTheme } from '@/contexts/ThemeContext';

/** Minimum time in ms the overlay stays visible once shown */
const MIN_DISPLAY_TIME = 1500;

/** Fixed progress bar width for consistent sizing */
const PROGRESS_BAR_WIDTH = 280;

interface LoadingOverlayProps {
  progress: LoadingProgress | null;
  isVisible: boolean;
  title?: string;
  subtitle?: string;
  showDetails?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  progress,
  isVisible,
  title = 'Loading',
  subtitle,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [isRendered, setIsRendered] = useState(isVisible);
  const [fadeIn, setFadeIn] = useState(false);
  const [canHide, setCanHide] = useState(true);
  const showTimeRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track when overlay becomes visible to enforce minimum display time
  useEffect(() => {
    if (isVisible) {
      if (showTimeRef.current === null) {
        showTimeRef.current = Date.now();
        setCanHide(false);
      }
      
      setIsRendered(true);
      requestAnimationFrame(() => {
        setFadeIn(true);
      });
      
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else {
      const visibleDuration = showTimeRef.current ? Date.now() - showTimeRef.current : MIN_DISPLAY_TIME;
      const remainingTime = Math.max(0, MIN_DISPLAY_TIME - visibleDuration);
      
      if (remainingTime > 0 && !canHide) {
        hideTimeoutRef.current = setTimeout(() => {
          setCanHide(true);
          setFadeIn(false);
          const timer = setTimeout(() => {
            setIsRendered(false);
            showTimeRef.current = null;
          }, 400);
          return () => clearTimeout(timer);
        }, remainingTime);
      } else {
        setFadeIn(false);
        const timer = setTimeout(() => {
          setIsRendered(false);
          showTimeRef.current = null;
        }, 400);
        return () => clearTimeout(timer);
      }
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isVisible, canHide]);

  if (!isRendered) return null;

  const percentage = Math.min(100, Math.max(0, progress?.percentage ?? 0));
  const phase = progress?.phase ?? 'initializing';
  const message = subtitle || progress?.message || getDefaultMessage(phase);

  // Derive display message based on context
  function getDefaultMessage(currentPhase: string): string {
    switch (currentPhase) {
      case 'initializing':
        return 'Initializing engine...';
      case 'downloading':
        return 'Loading assets...';
      case 'parsing':
        return 'Building renderer...';
      case 'creating':
        return 'Preparing workspace...';
      case 'complete':
        return 'Ready!';
      case 'error':
        return 'Something went wrong';
      default:
        return 'Loading...';
    }
  }

  const isComplete = phase === 'complete' || percentage >= 100;
  const isError = phase === 'error';

  // Theme-aware colors
  const bgGradient = isDark
    ? 'linear-gradient(145deg, #0a0a18 0%, #111827 50%, #0d1117 100%)'
    : 'linear-gradient(145deg, #f8fafc 0%, #e5e7eb 50%, #f3f4f6 100%)';

  const gridColor = isDark ? 'rgba(20, 127, 212, 0.06)' : 'rgba(20, 127, 212, 0.04)';

  return (
    <div
      className={`absolute inset-0 z-[9999] flex items-center justify-center transition-all duration-400 ${
        fadeIn ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ background: bgGradient }}
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
        
        {/* Animated Logo */}
        <div className="relative mb-8">
          {/* Outer glow ring */}
          <div 
            className={`absolute inset-0 rounded-2xl blur-xl transition-opacity duration-500 ${
              isComplete ? 'opacity-80' : 'opacity-40'
            }`}
            style={{
              background: isError 
                ? 'radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, transparent 70%)'
                : isComplete 
                  ? 'radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(20, 127, 212, 0.3) 0%, transparent 70%)',
              transform: 'scale(1.5)',
            }}
          />
          
          {/* Icon container */}
          <div className={`
            relative w-20 h-20 rounded-2xl flex items-center justify-center
            border backdrop-blur-sm transition-all duration-300
            ${isError 
              ? isDark 
                ? 'bg-red-950/50 border-red-500/40' 
                : 'bg-red-50 border-red-300'
              : isComplete
                ? isDark 
                  ? 'bg-green-950/50 border-green-500/40' 
                  : 'bg-green-50 border-green-300'
                : isDark 
                  ? 'bg-gray-900/80 border-primary-500/30' 
                  : 'bg-white/80 border-primary-300'
            }
          `}>
            {/* BluDesign Logo - 3D Cube */}
            <svg 
              viewBox="0 0 48 48" 
              className={`w-10 h-10 transition-colors duration-300 ${
                isError 
                  ? 'text-red-500' 
                  : isComplete 
                    ? 'text-green-500' 
                    : isDark ? 'text-primary-400' : 'text-primary-600'
              }`}
              style={{
                animation: isComplete || isError ? 'none' : 'pulse-subtle 2s ease-in-out infinite',
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
              {/* Inner details */}
              <path 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round"
                strokeOpacity="0.5"
                d="M15 19v10 M24 14v10 M33 19v10"
              />
            </svg>
            
            {/* Success checkmark overlay */}
            {isComplete && (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg 
                  viewBox="0 0 24 24" 
                  className="w-8 h-8 text-green-500"
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
        </div>

        {/* Title */}
        <h2 className={`text-lg font-semibold mb-6 transition-colors duration-300 ${
          isError 
            ? isDark ? 'text-red-400' : 'text-red-600'
            : isComplete
              ? isDark ? 'text-green-400' : 'text-green-600'
              : isDark ? 'text-white' : 'text-gray-900'
        }`}>
          {isError ? 'Error' : isComplete ? 'Ready!' : title}
        </h2>

        {/* Progress Bar - Fixed Width */}
        <div 
          className={`relative h-1.5 rounded-full overflow-hidden mb-4 transition-all duration-300 ${
            isDark ? 'bg-gray-800' : 'bg-gray-200'
          }`}
          style={{ width: PROGRESS_BAR_WIDTH }}
        >
          {/* Progress Fill */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
              isError 
                ? 'bg-red-500' 
                : isComplete
                  ? 'bg-green-500'
                  : isDark 
                    ? 'bg-gradient-to-r from-primary-600 to-primary-400'
                    : 'bg-gradient-to-r from-primary-500 to-primary-400'
            }`}
            style={{ width: `${percentage}%` }}
          />
          
          {/* Animated shimmer effect during loading */}
          {!isComplete && !isError && (
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
        <div className={`text-2xl font-bold mb-3 tabular-nums transition-colors duration-300 ${
          isError 
            ? isDark ? 'text-red-400' : 'text-red-600'
            : isComplete
              ? isDark ? 'text-green-400' : 'text-green-600'
              : isDark ? 'text-white' : 'text-gray-900'
        }`}>
          {Math.round(percentage)}%
        </div>

        {/* Message - Single Line */}
        <p className={`text-sm text-center max-w-xs transition-colors duration-300 ${
          isDark ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {message}
        </p>

        {/* Error Details */}
        {isError && progress?.error && (
          <div className={`
            mt-4 px-4 py-2 rounded-lg max-w-xs text-center
            ${isDark 
              ? 'bg-red-950/50 border border-red-500/30' 
              : 'bg-red-50 border border-red-200'
            }
          `}>
            <p className={`text-xs ${isDark ? 'text-red-300' : 'text-red-600'}`}>
              {progress.error}
            </p>
          </div>
        )}
      </div>

      {/* Decorative floating elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={`absolute w-3 h-3 border rounded-sm ${
              isDark ? 'border-primary-500/15' : 'border-primary-400/20'
            }`}
            style={{
              left: `${20 + i * 20}%`,
              top: `${25 + (i % 2) * 50}%`,
              transform: 'rotate(45deg)',
              animation: `float ${4 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.5}s`,
            }}
          />
        ))}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        
        @keyframes float {
          0%, 100% { 
            transform: rotate(45deg) translateY(0); 
            opacity: 0.2; 
          }
          50% { 
            transform: rotate(45deg) translateY(-15px); 
            opacity: 0.5; 
          }
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

export default LoadingOverlay;
