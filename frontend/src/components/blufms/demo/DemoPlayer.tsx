import React, { useState } from 'react';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { DemoScript } from '@/scripts/blufms/demoActionTypes';

interface DemoPlayerProps {
  scripts: DemoScript[];
  isPlaying: boolean;
  isPaused: boolean;
  currentStep: number;
  totalSteps: number;
  currentScript: DemoScript | null;
  onPlay: (script: DemoScript) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export const DemoPlayer: React.FC<DemoPlayerProps> = ({
  scripts,
  isPlaying,
  isPaused,
  currentStep,
  totalSteps,
  currentScript,
  onPlay,
  onPause,
  onResume,
  onStop,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePlay = (script: DemoScript) => {
    onPlay(script);
    setIsExpanded(false);
  };

  return (
    <div className="absolute top-4 left-4 z-30">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
        {/* Collapsed Header */}
        <div className="flex items-center gap-2 p-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {isExpanded ? (
              <ChevronUpIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            )}
          </button>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Demo Player
          </span>
          {isPlaying && (
            <div className="ml-auto flex items-center gap-2">
              {isPaused ? (
                <button
                  onClick={onResume}
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Resume"
                >
                  <PlayIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Pause"
                >
                  <PauseIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </button>
              )}
              <button
                onClick={onStop}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Stop"
              >
                <StopIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
              </button>
            </div>
          )}
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2 max-h-96 overflow-y-auto">
            {scripts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No demo scripts available
              </p>
            ) : (
              <>
                {scripts.map((script) => (
                  <button
                    key={script.id}
                    onClick={() => handlePlay(script)}
                    disabled={isPlaying}
                    className={`
                      w-full text-left p-3 rounded-lg border transition-all duration-200
                      ${isPlaying
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer'
                      }
                      ${currentScript?.id === script.id
                        ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                        : ''
                      }
                    `}
                  >
                    <div className="font-medium text-sm text-gray-900 dark:text-white mb-1">
                      {script.name}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {script.description}
                    </div>
                  </button>
                ))}
                {isPlaying && currentScript && (
                  <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Progress: {currentStep} / {totalSteps}
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-primary-600 dark:bg-primary-400 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


