import React from 'react';
import { TimelineMarker } from '@/scripts/blufms/demoActionTypes';

interface TimelineCardProps {
  markers: TimelineMarker[];
  currentStep: number;
  onMarkerClick?: (step: number) => void;
}

export const TimelineCard: React.FC<TimelineCardProps> = ({
  markers,
  currentStep,
  onMarkerClick,
}) => {
  if (markers.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border-l-2 border-l-primary-400 dark:border-l-primary-500 border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-md">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Workflow Timeline
      </h3>
      <div className="space-y-3">
        {markers.map((marker, index) => {
          const isActive = marker.step === currentStep;
          const isPast = marker.step < currentStep;
          const isClickable = onMarkerClick !== undefined;

          return (
            <button
              key={marker.id}
              onClick={() => isClickable && onMarkerClick(marker.step)}
              disabled={!isClickable}
              className={`
                w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 text-left
                ${isClickable ? 'hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer' : 'cursor-default'}
                ${isActive ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-700' : 'border border-gray-200 dark:border-gray-700'}
              `}
            >
              <div className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-200
                ${isActive 
                  ? 'bg-primary-600 dark:bg-primary-400 text-white' 
                  : isPast 
                    ? 'bg-green-500 dark:bg-green-400 text-white' 
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                }
              `}>
                {isPast ? '✓' : marker.step}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`
                  text-sm font-medium
                  ${isActive 
                    ? 'text-primary-600 dark:text-primary-400' 
                    : 'text-gray-900 dark:text-white'
                  }
                `}>
                  {marker.label}
                </div>
                {marker.timestamp && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {marker.timestamp}
                  </div>
                )}
              </div>
              {isActive && (
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-primary-600 dark:bg-primary-400 rounded-full animate-pulse" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

