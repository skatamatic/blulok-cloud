/**
 * Viewer Properties Panel
 * 
 * Compact, slide-in panel showing properties of the selected smart object.
 * Read-only display with real-time state information.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  CubeIcon,
  BoltIcon,
  LockClosedIcon,
  LockOpenIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { PlacedObject, DeviceState } from '../core/types';
import { AssetRegistry } from '../assets/AssetRegistry';

/** Binding info from placed object */
interface ObjectBinding {
  entityType: 'unit' | 'device' | 'facility';
  entityId?: string;
  currentState: DeviceState;
}

interface ViewerPropertiesPanelProps {
  selectedObject: PlacedObject | null;
  onClose: () => void;
  liveState?: {
    state: DeviceState;
    lockStatus?: string;
    batteryLevel?: number;
    lastActivity?: string;
  };
}

/**
 * Get icon for device state
 */
const getStateIcon = (state: DeviceState) => {
  switch (state) {
    case DeviceState.LOCKED:
      return <LockClosedIcon className="w-5 h-5" />;
    case DeviceState.UNLOCKED:
      return <LockOpenIcon className="w-5 h-5" />;
    case DeviceState.ERROR:
      return <ExclamationTriangleIcon className="w-5 h-5" />;
    case DeviceState.MAINTENANCE:
      return <WrenchScrewdriverIcon className="w-5 h-5" />;
    case DeviceState.OFFLINE:
      return <SignalSlashIcon className="w-5 h-5" />;
    default:
      return <CubeIcon className="w-5 h-5" />;
  }
};

/**
 * Get color for device state
 */
const getStateColor = (state: DeviceState, isDark: boolean) => {
  switch (state) {
    case DeviceState.LOCKED:
      return {
        bg: isDark ? 'bg-green-900/30' : 'bg-green-100',
        text: isDark ? 'text-green-400' : 'text-green-700',
        border: isDark ? 'border-green-500/30' : 'border-green-300',
      };
    case DeviceState.UNLOCKED:
      return {
        bg: isDark ? 'bg-yellow-900/30' : 'bg-yellow-100',
        text: isDark ? 'text-yellow-400' : 'text-yellow-700',
        border: isDark ? 'border-yellow-500/30' : 'border-yellow-300',
      };
    case DeviceState.ERROR:
      return {
        bg: isDark ? 'bg-red-900/30' : 'bg-red-100',
        text: isDark ? 'text-red-400' : 'text-red-700',
        border: isDark ? 'border-red-500/30' : 'border-red-300',
      };
    case DeviceState.MAINTENANCE:
      return {
        bg: isDark ? 'bg-orange-900/30' : 'bg-orange-100',
        text: isDark ? 'text-orange-400' : 'text-orange-700',
        border: isDark ? 'border-orange-500/30' : 'border-orange-300',
      };
    case DeviceState.OFFLINE:
      return {
        bg: isDark ? 'bg-gray-800/50' : 'bg-gray-200',
        text: isDark ? 'text-gray-400' : 'text-gray-600',
        border: isDark ? 'border-gray-600/30' : 'border-gray-400',
      };
    default:
      return {
        bg: isDark ? 'bg-gray-800/50' : 'bg-gray-100',
        text: isDark ? 'text-gray-400' : 'text-gray-600',
        border: isDark ? 'border-gray-600/30' : 'border-gray-300',
      };
  }
};

/**
 * Get battery indicator based on level
 */
const BatteryIndicator: React.FC<{ level: number }> = ({ level }) => {
  const color = level < 20 ? 'text-red-500' : level < 50 ? 'text-yellow-500' : 'text-green-500';
  const fillWidth = Math.max(2, Math.min(12, Math.round(level / 100 * 12)));
  
  return (
    <svg className={`w-5 h-4 ${color}`} viewBox="0 0 20 16" fill="none">
      {/* Battery outline */}
      <rect x="1" y="3" width="15" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* Battery cap */}
      <rect x="16" y="6" width="2" height="4" rx="0.5" fill="currentColor" />
      {/* Battery fill */}
      <rect x="3" y="5" width={fillWidth} height="6" rx="0.5" fill="currentColor" />
    </svg>
  );
};

/**
 * Format state label
 */
const formatStateLabel = (state: DeviceState): string => {
  return state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
};

export const ViewerPropertiesPanel: React.FC<ViewerPropertiesPanelProps> = ({
  selectedObject,
  onClose,
  liveState,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  // Get asset metadata
  const assetMetadata = selectedObject?.assetMetadata || 
    (selectedObject ? AssetRegistry.getInstance().getAsset(selectedObject.assetId) : null);
  
  const isSmart = assetMetadata?.isSmart ?? false;
  const binding = selectedObject?.binding as ObjectBinding | undefined;
  
  // Determine current state (from live state or binding)
  const currentState = liveState?.state || binding?.currentState || DeviceState.UNKNOWN;
  const stateColors = getStateColor(currentState, isDark);

  return (
    <AnimatePresence>
      {selectedObject && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`
            absolute top-4 right-4 bottom-20 w-72 z-40
            rounded-xl overflow-hidden shadow-2xl border backdrop-blur-md
            ${isDark 
              ? 'bg-gray-900/95 border-gray-700/60' 
              : 'bg-white/95 border-gray-200/80'
            }
          `}
        >
          {/* Header */}
          <div className={`
            flex items-center justify-between px-4 py-3 border-b
            ${isDark ? 'border-gray-700/50' : 'border-gray-200/50'}
          `}>
            <div className="flex items-center gap-2">
              <div className={`
                w-8 h-8 rounded-lg flex items-center justify-center
                ${isDark ? 'bg-primary-600/20' : 'bg-primary-100'}
              `}>
                <CubeIcon className="w-4 h-4 text-primary-500" />
              </div>
              <div className="min-w-0">
                <h3 className={`text-sm font-semibold truncate ${
                  isDark ? 'text-white' : 'text-gray-900'
                }`}>
                  {selectedObject.name || assetMetadata?.name || 'Object'}
                </h3>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {assetMetadata?.category || 'Asset'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`
                p-1.5 rounded-lg transition-colors
                ${isDark 
                  ? 'hover:bg-gray-800 text-gray-400 hover:text-white' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                }
              `}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100% - 60px)' }}>
            {/* Smart Asset State */}
            {isSmart && (
              <div className={`
                rounded-lg p-3 border ${stateColors.bg} ${stateColors.border}
              `}>
                <div className="flex items-center gap-3">
                  <div className={stateColors.text}>
                    {getStateIcon(currentState)}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${stateColors.text}`}>
                      {formatStateLabel(currentState)}
                    </p>
                    {liveState?.lastActivity && (
                      <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Last activity: {new Date(liveState.lastActivity).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Battery Level */}
                {liveState?.batteryLevel !== undefined && (
                  <div className={`
                    mt-3 pt-3 border-t flex items-center justify-between
                    ${isDark ? 'border-gray-700/50' : 'border-gray-300/50'}
                  `}>
                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Battery
                    </span>
                    <div className="flex items-center gap-1.5">
                      <BatteryIndicator level={liveState.batteryLevel} />
                      <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {liveState.batteryLevel}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Binding Info */}
            {binding?.entityId && (
              <div>
                <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  Linked To
                </h4>
                <div className={`
                  rounded-lg p-3 border
                  ${isDark 
                    ? 'bg-gray-800/50 border-gray-700/50' 
                    : 'bg-gray-50 border-gray-200'
                  }
                `}>
                  <div className="flex items-center gap-2">
                    <BoltIcon className="w-4 h-4 text-primary-500" />
                    <div>
                      <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                        {binding.entityId}
                      </p>
                      <p className={`text-xs capitalize ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {binding.entityType}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Position Info */}
            <div>
              <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                isDark ? 'text-gray-500' : 'text-gray-400'
              }`}>
                Location
              </h4>
              <div className={`
                rounded-lg p-3 border grid grid-cols-2 gap-2
                ${isDark 
                  ? 'bg-gray-800/50 border-gray-700/50' 
                  : 'bg-gray-50 border-gray-200'
                }
              `}>
                <div>
                  <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Position</p>
                  <p className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    ({selectedObject.position.x}, {selectedObject.position.z})
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Floor</p>
                  <p className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {selectedObject.floor === 0 ? 'Ground' : `Level ${selectedObject.floor}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Not Bound Notice */}
            {isSmart && !binding?.entityId && (
              <div className={`
                rounded-lg p-3 border text-center
                ${isDark 
                  ? 'bg-gray-800/30 border-gray-700/30' 
                  : 'bg-gray-50 border-gray-200'
                }
              `}>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  This object is not linked to live data
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ViewerPropertiesPanel;

