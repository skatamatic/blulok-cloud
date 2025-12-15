/**
 * Loading Progress Components
 * 
 * Various progress indicators for BluDesign loading states.
 */

import React from 'react';
import { LoadingProgress as LoadingProgressType } from '../loading/LoadingManager';

// =============================================================================
// Circular Progress
// =============================================================================

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  color?: string;
  trackColor?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  percentage,
  size = 64,
  strokeWidth = 4,
  showLabel = true,
  color = '#147FD4',
  trackColor = '#374151',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-300 ease-out"
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-bold text-white">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
};

// =============================================================================
// Linear Progress Bar
// =============================================================================

interface LinearProgressProps {
  percentage: number;
  height?: number;
  showLabel?: boolean;
  color?: string;
  trackColor?: string;
  animated?: boolean;
  striped?: boolean;
}

export const LinearProgress: React.FC<LinearProgressProps> = ({
  percentage,
  height = 8,
  showLabel = false,
  color = '#147FD4',
  trackColor = '#374151',
  animated = true,
  striped = false,
}) => {
  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-400">Progress</span>
          <span className="text-xs font-medium text-white">{percentage}%</span>
        </div>
      )}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height, backgroundColor: trackColor }}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            striped ? 'bg-stripes' : ''
          } ${animated && striped ? 'animate-stripes' : ''}`}
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
            backgroundImage: striped
              ? 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)'
              : undefined,
            backgroundSize: striped ? '1rem 1rem' : undefined,
          }}
        />
      </div>
    </div>
  );
};

// =============================================================================
// Indeterminate Progress
// =============================================================================

interface IndeterminateProgressProps {
  height?: number;
  color?: string;
  trackColor?: string;
}

export const IndeterminateProgress: React.FC<IndeterminateProgressProps> = ({
  height = 4,
  color = '#147FD4',
  trackColor = '#374151',
}) => {
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height, backgroundColor: trackColor }}
    >
      <div
        className="h-full rounded-full animate-indeterminate"
        style={{ backgroundColor: color, width: '30%' }}
      />
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .animate-indeterminate {
          animation: indeterminate 1.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

// =============================================================================
// Progress Card
// =============================================================================

interface ProgressCardProps {
  progress: LoadingProgressType | null;
  title?: string;
  compact?: boolean;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({
  progress,
  title = 'Loading',
  compact = false,
}) => {
  if (!progress) {
    return (
      <div className={`bg-gray-800/50 rounded-lg ${compact ? 'p-3' : 'p-4'}`}>
        <p className="text-sm text-gray-400">Ready</p>
      </div>
    );
  }

  const { phase, percentage, current, total, message, error } = progress;

  const getPhaseColor = () => {
    switch (phase) {
      case 'complete':
        return '#22c55e';
      case 'error':
        return '#ef4444';
      default:
        return '#147FD4';
    }
  };

  return (
    <div
      className={`bg-gray-800/50 border border-gray-700 rounded-lg ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex items-center gap-3">
        <CircularProgress
          percentage={percentage}
          size={compact ? 40 : 56}
          strokeWidth={3}
          color={getPhaseColor()}
        />

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{title}</h4>
          {message && (
            <p className="text-xs text-gray-400 truncate">{message}</p>
          )}
          {total !== undefined && total > 0 && !compact && (
            <p className="text-xs text-gray-500">
              {current} / {total} items
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Step Progress
// =============================================================================

interface Step {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

interface StepProgressProps {
  steps: Step[];
  currentStep?: string;
  vertical?: boolean;
}

export const StepProgress: React.FC<StepProgressProps> = ({
  steps,
  currentStep: _currentStep,
  vertical = false,
}) => {
  const getStepColor = (status: Step['status']) => {
    switch (status) {
      case 'complete':
        return 'bg-green-500 border-green-500';
      case 'active':
        return 'bg-primary-500 border-primary-500';
      case 'error':
        return 'bg-red-500 border-red-500';
      default:
        return 'bg-gray-700 border-gray-600';
    }
  };

  const getConnectorColor = (status: Step['status']) => {
    return status === 'complete' ? 'bg-green-500' : 'bg-gray-700';
  };

  return (
    <div
      className={`flex ${vertical ? 'flex-col' : 'flex-row items-center'} ${
        vertical ? 'space-y-0' : 'space-x-2'
      }`}
    >
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div
            className={`flex items-center ${vertical ? 'flex-row' : 'flex-col'}`}
          >
            {/* Step Circle */}
            <div
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${getStepColor(
                step.status
              )}`}
            >
              {step.status === 'complete' ? (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : step.status === 'error' ? (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              ) : (
                <span className="text-xs font-bold text-white">{index + 1}</span>
              )}
            </div>

            {/* Label */}
            <span
              className={`text-xs mt-1 ${vertical ? 'ml-3 mt-0' : ''} ${
                step.status === 'active' ? 'text-white font-medium' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>

          {/* Connector */}
          {index < steps.length - 1 && (
            <div
              className={`${
                vertical
                  ? 'ml-4 w-0.5 h-6'
                  : 'flex-1 h-0.5 min-w-[20px]'
              } ${getConnectorColor(step.status)}`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// =============================================================================
// Exports
// =============================================================================

export default {
  CircularProgress,
  LinearProgress,
  IndeterminateProgress,
  ProgressCard,
  StepProgress,
};

