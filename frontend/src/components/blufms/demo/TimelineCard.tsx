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
    <div className="bg-white dark:bg-gray-900 rounded-lg border-l-2 border-l-primary-400 dark:border-l-primary-500 border-r border-t border-b border-gray-200 dark:border-gray-800 p-3 shadow-md">
      <h3 className="text-xs font-semibold text-gray-900 dark:text-white mb-2">
        Event Timeline
      </h3>
      <div className="space-y-1.5">
        {markers.map((marker, index) => {
          const isActive = marker.step === currentStep;
          const isPast = marker.step < currentStep;
          const isClickable = onMarkerClick !== undefined;

          return (
            <div
              key={marker.id}
              className={`
                flex items-center gap-2 py-1.5 px-2 rounded transition-colors duration-150
                ${isActive ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
              `}
            >
              <div className={`
                flex-shrink-0 w-1.5 h-1.5 rounded-full transition-all duration-200
                ${isActive 
                  ? 'bg-primary-600 dark:bg-primary-400' 
                  : isPast 
                    ? 'bg-green-500 dark:bg-green-400' 
                    : 'bg-gray-300 dark:bg-gray-600'
                }
              `} />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className={`
                  text-xs font-medium
                  ${isActive 
                    ? 'text-primary-600 dark:text-primary-400' 
                    : isPast
                      ? 'text-gray-700 dark:text-gray-300'
                      : 'text-gray-500 dark:text-gray-400'
                  }
                `}>
                  {marker.timestamp || ''}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                <span className={`
                  text-xs
                  ${isActive 
                    ? 'text-primary-600 dark:text-primary-400 font-medium' 
                    : 'text-gray-600 dark:text-gray-400'
                  }
                `}>
                  {marker.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

