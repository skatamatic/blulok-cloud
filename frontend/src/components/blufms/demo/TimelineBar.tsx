import React from 'react';
import { TimelineMarker } from '@/scripts/blufms/demoActionTypes';

interface TimelineBarProps {
  visible: boolean;
  markers: TimelineMarker[];
  currentStep: number;
  onMarkerClick?: (step: number) => void;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  visible,
  markers,
  currentStep,
  onMarkerClick,
}) => {
  if (!visible || markers.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 h-24 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-30">
      <div className="h-full px-4 py-3 overflow-x-auto">
        <div className="flex items-center h-full gap-4 min-w-max">
          {markers.map((marker) => {
            const isActive = marker.step === currentStep;
            const isPast = marker.step < currentStep;
            const isClickable = onMarkerClick !== undefined;

            return (
              <button
                key={marker.id}
                onClick={() => isClickable && onMarkerClick(marker.step)}
                disabled={!isClickable}
                className={`
                  flex flex-col items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200
                  ${isClickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : 'cursor-default'}
                  ${isActive ? 'bg-primary-100 dark:bg-primary-900/20' : ''}
                `}
              >
                <div className={`
                  w-3 h-3 rounded-full transition-all duration-200
                  ${isActive 
                    ? 'bg-primary-600 dark:bg-primary-400 scale-125' 
                    : isPast 
                      ? 'bg-green-500 dark:bg-green-400' 
                      : 'bg-gray-300 dark:bg-gray-600'
                  }
                `} />
                <div className="text-center min-w-[80px]">
                  <div className={`
                    text-xs font-medium
                    ${isActive 
                      ? 'text-primary-600 dark:text-primary-400' 
                      : 'text-gray-600 dark:text-gray-400'
                    }
                  `}>
                    {marker.label}
                  </div>
                  {marker.timestamp && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                      {marker.timestamp}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};


