/**
 * On-canvas viewer controls available to anyone who can see the widget
 * (tenants included): optional 2D/3D mode switch (when a 2D layout exists) and a
 * toggle to turn live binding effects off so units render in their default
 * locked look. Styled to match {@link ViewerFloorsPanel}.
 */

import React from 'react';
import {
  CubeIcon,
  MapIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';

export type ViewerCanvasDisplayMode = '3d' | '2d';

interface ViewerOnCanvasControlsProps {
  isDark: boolean;
  /** Show the 2D/3D toggle (only when a 2D layout is available). */
  show2dToggle: boolean;
  displayMode: ViewerCanvasDisplayMode;
  /** Flip between 2D and 3D. */
  onToggleDisplayMode: () => void;
  /** Show the live-status toggle (hidden in 2D, which always shows live status). */
  showBindingToggle: boolean;
  bindingEffectsEnabled: boolean;
  onToggleBindingEffects: () => void;
  /** Positioning / extra classes applied to the card wrapper. */
  className?: string;
}

export const ViewerOnCanvasControls: React.FC<ViewerOnCanvasControlsProps> = ({
  isDark,
  show2dToggle,
  displayMode,
  onToggleDisplayMode,
  showBindingToggle,
  bindingEffectsEnabled,
  onToggleBindingEffects,
  className = '',
}) => {
  const buttonBase = `p-2 rounded-lg transition-all duration-200 backdrop-blur-sm border hover:scale-105 active:scale-95 ${
    isDark
      ? 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white border-gray-700/50'
      : 'bg-white/80 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border-gray-200/80'
  }`;

  const activeClasses = isDark
    ? '!bg-primary-600 !text-white !border-primary-500'
    : '!bg-primary-500 !text-white !border-primary-400';

  const dividerClasses = isDark ? 'bg-gray-700/60' : 'bg-gray-200/80';

  const switchingToPlan = displayMode === '3d';

  return (
    <div
      className={`flex items-center gap-1 p-1.5 rounded-xl shadow-xl border backdrop-blur-md ${
        isDark ? 'bg-gray-900/90 border-gray-700/60' : 'bg-white/90 border-gray-200/80'
      } ${className}`}
    >
      {show2dToggle && (
        <>
          <button
            type="button"
            onClick={onToggleDisplayMode}
            title={switchingToPlan ? 'Switch to 2D plan view' : 'Switch to 3D view'}
            aria-label={switchingToPlan ? 'Switch to 2D plan view' : 'Switch to 3D view'}
            className={buttonBase}
          >
            {switchingToPlan ? (
              <MapIcon className="w-5 h-5" />
            ) : (
              <CubeIcon className="w-5 h-5" />
            )}
          </button>
          {showBindingToggle && (
            <div className={`mx-0.5 h-6 w-px ${dividerClasses}`} aria-hidden="true" />
          )}
        </>
      )}

      {showBindingToggle && (
        <button
          type="button"
          onClick={onToggleBindingEffects}
          title={bindingEffectsEnabled ? 'Live status: on' : 'Live status: off'}
          aria-label={
            bindingEffectsEnabled ? 'Turn off live status effects' : 'Turn on live status effects'
          }
          aria-pressed={bindingEffectsEnabled}
          className={`${buttonBase} ${bindingEffectsEnabled ? activeClasses : ''}`}
        >
          {bindingEffectsEnabled ? (
            <SignalIcon className="w-5 h-5" />
          ) : (
            <SignalSlashIcon className="w-5 h-5" />
          )}
        </button>
      )}
    </div>
  );
};

export default ViewerOnCanvasControls;
