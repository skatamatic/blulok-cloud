/**
 * Default Camera Panel
 *
 * Set, preview, and clear the facility's saved home camera view.
 */

import React from 'react';
import {
  VideoCameraIcon,
  BookmarkIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';

interface DefaultCameraPanelProps {
  hasDefault: boolean;
  summary?: string;
  onSetFromCurrentView: () => void;
  onGoToDefault: () => void;
  onClearDefault: () => void;
}

export const DefaultCameraPanel: React.FC<DefaultCameraPanelProps> = ({
  hasDefault,
  summary,
  onSetFromCurrentView,
  onGoToDefault,
  onClearDefault,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const buttonSecondary = `flex items-center justify-center gap-2 w-full px-2 py-2 text-xs rounded-md font-medium transition-all duration-150 ${
    isDark
      ? 'bg-gray-700/40 text-gray-300 hover:bg-gray-600/50'
      : 'bg-gray-200/60 text-gray-700 hover:bg-gray-300/60'
  }`;

  const buttonPrimary = `flex items-center justify-center gap-2 w-full px-2 py-2 text-xs rounded-md font-medium transition-all duration-150 bg-primary-600 text-white hover:bg-primary-500`;

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
        <VideoCameraIcon className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          Save your current camera angle as the facility home view. It restores automatically
          when this facility opens in the editor, viewer, or dashboard widgets. Sky and ground
          appearance are configured separately in the dashboard widget View settings.
        </p>
      </div>

      {hasDefault ? (
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            isDark
              ? 'border-green-800/60 bg-green-950/20 text-green-300'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <CheckCircleIcon className="w-4 h-4 shrink-0" />
            <span>Default view saved</span>
          </div>
          {summary && (
            <p className={`mt-1 text-xs ${isDark ? 'text-green-400/80' : 'text-green-700'}`}>
              {summary}
            </p>
          )}
        </div>
      ) : (
        <div
          className={`rounded-lg border border-dashed px-3 py-2.5 text-xs ${
            isDark ? 'border-gray-700 text-gray-400' : 'border-gray-300 text-gray-500'
          }`}
        >
          No default view yet. Frame the scene, then capture your current camera below.
        </div>
      )}

      <button type="button" className={buttonPrimary} onClick={onSetFromCurrentView}>
        <BookmarkIcon className="w-4 h-4" />
        <span>Set from current view</span>
      </button>

      <button
        type="button"
        className={buttonSecondary}
        onClick={onGoToDefault}
        disabled={!hasDefault}
        title={hasDefault ? 'Animate to default view' : 'Set a default view first'}
      >
        <ArrowPathIcon className="w-4 h-4" />
        <span>Go to default view</span>
      </button>

      {hasDefault && (
        <button
          type="button"
          className={`${buttonSecondary} ${
            isDark ? 'hover:!bg-red-950/40 hover:!text-red-300' : 'hover:!bg-red-50 hover:!text-red-700'
          }`}
          onClick={onClearDefault}
        >
          <TrashIcon className="w-4 h-4" />
          <span>Clear default view</span>
        </button>
      )}
    </div>
  );
};
