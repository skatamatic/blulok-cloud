/**
 * Theme Missing Dialog
 * 
 * Shown when a facility's saved theme is no longer available.
 */

import React from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemeMissingDialogProps {
  isOpen: boolean;
  missingThemeId: string;
  missingThemeName?: string;
  onClose: () => void;
}

export const ThemeMissingDialog: React.FC<ThemeMissingDialogProps> = ({
  isOpen,
  missingThemeId,
  missingThemeName,
  onClose,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className={`rounded-xl shadow-2xl border max-w-md w-full mx-4 ${
          isDark ? 'bg-gray-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center gap-3 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="p-2 rounded-full bg-amber-500/20">
            <ExclamationTriangleIcon className="w-6 h-6 text-amber-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Theme Not Found</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
            This facility was saved with a theme that is no longer available:
          </p>
          
          <div className={`px-4 py-3 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {missingThemeName || 'Custom Theme'}
            </div>
            <div className={`text-xs font-mono mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {missingThemeId}
            </div>
          </div>

          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            The theme may have been deleted or was created on a different device. 
            The default theme has been applied instead.
          </p>
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-500 text-white transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemeMissingDialog;

