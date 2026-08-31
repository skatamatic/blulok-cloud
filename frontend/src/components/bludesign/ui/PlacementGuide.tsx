/**
 * Placement Guide
 * 
 * Beautiful floating guide showing hotkeys during asset placement.
 * Displays in top-right corner with glass-morphism design.
 */

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  ArrowPathIcon, 
  CheckCircleIcon, 
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { Orientation } from '../core/types';

export interface PlacementGuideProps {
  currentOrientation: Orientation;
  assetName?: string;
}

export const PlacementGuide: React.FC<PlacementGuideProps> = ({
  currentOrientation,
  assetName,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const getOrientationLabel = () => {
    switch (currentOrientation) {
      case Orientation.NORTH: return 'North';
      case Orientation.EAST: return 'East';
      case Orientation.SOUTH: return 'South';
      case Orientation.WEST: return 'West';
      default: return 'North';
    }
  };

  return (
    <div
      className="fixed top-4 right-4 z-50 animate-fade-in"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div
        className={`
          backdrop-blur-md rounded-lg shadow-2xl border
          ${isDark
            ? 'bg-gray-900/95 border-gray-700/60'
            : 'bg-white/95 border-gray-300/60'
          }
        `}
        style={{ minWidth: '220px' }}
      >
        {/* Header */}
        <div className={`px-4 py-2 border-b ${isDark ? 'border-gray-800/60' : 'border-gray-200/60'}`}>
          <div className="flex items-center gap-2">
            <div className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Placing Asset
            </div>
          </div>
          {assetName && (
            <div className={`text-sm font-medium mt-0.5 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {assetName}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 space-y-2">
          {/* Current orientation */}
          <div className={`flex items-center justify-between text-xs mb-3 pb-2 border-b ${isDark ? 'border-gray-800/60' : 'border-gray-200/60'}`}>
            <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Orientation:</span>
            <span className={`font-medium ${isDark ? 'text-primary-400' : 'text-primary-600'}`}>
              {getOrientationLabel()}
            </span>
          </div>

          {/* Rotate Left */}
          <ActionRow
            icon={<ArrowPathIcon className="w-4 h-4 -scale-x-100" />}
            label="Rotate Left"
            hotkey="Q"
            isDark={isDark}
          />

          {/* Rotate Right */}
          <ActionRow
            icon={<ArrowPathIcon className="w-4 h-4" />}
            label="Rotate Right"
            hotkey="E"
            isDark={isDark}
          />

          {/* Place */}
          <ActionRow
            icon={<CheckCircleIcon className="w-4 h-4" />}
            label="Place Asset"
            hotkey="Space"
            isDark={isDark}
            primary
          />

          {/* Cancel */}
          <ActionRow
            icon={<XCircleIcon className="w-4 h-4" />}
            label="Cancel"
            hotkey="Esc"
            isDark={isDark}
            danger
          />
        </div>
      </div>

      {/* Inline styles for animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// Action Row Component
interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  hotkey: string;
  isDark: boolean;
  primary?: boolean;
  danger?: boolean;
}

const ActionRow: React.FC<ActionRowProps> = ({
  icon,
  label,
  hotkey,
  isDark,
  primary,
  danger,
}) => {
  const getIconColor = () => {
    if (primary) return isDark ? 'text-green-400' : 'text-green-600';
    if (danger) return isDark ? 'text-red-400' : 'text-red-600';
    return isDark ? 'text-primary-400' : 'text-primary-600';
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className={`flex-shrink-0 ${getIconColor()}`}>
          {icon}
        </div>
        <span className={`text-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
        </span>
      </div>
      <kbd
        className={`
          px-2 py-1 text-[10px] font-bold rounded border shadow-sm flex-shrink-0
          ${isDark
            ? 'bg-gray-800 border-gray-700 text-gray-300'
            : 'bg-gray-100 border-gray-300 text-gray-700'
          }
        `}
        style={{ fontFamily: 'ui-monospace, monospace' }}
      >
        {hotkey}
      </kbd>
    </div>
  );
};

export default PlacementGuide;



