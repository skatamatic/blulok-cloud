/**
 * Viewer Smart Objects Panel
 * 
 * Compact, collapsible smart objects search panel for the readonly facility viewer.
 * Fixed to bottom-right, above the floors panel. Uses the same SmartObjectsPanel component
 * as the editor, but wrapped in an expandable container.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { SmartObjectsPanel } from '../ui/panels/SmartObjectsPanel';
import { PlacedObject, Building } from '../core/types';

interface ViewerSmartObjectsPanelProps {
  objects: PlacedObject[];
  buildings: Building[];
  onFocusObject: (objectId: string, floor: number) => void;
  onFocusBuilding: (buildingId: string) => void;
  /** Maximum height for the expanded panel content (defaults to 384px / max-h-96) */
  maxExpandedHeight?: number;
}

export const ViewerSmartObjectsPanel: React.FC<ViewerSmartObjectsPanelProps> = ({
  objects,
  buildings,
  onFocusObject,
  onFocusBuilding,
  maxExpandedHeight,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);

  // In view-only mode, selection doesn't do anything, so we just use focus
  const handleSelectObject = useCallback((objectId: string) => {
    // In view-only mode, single click also focuses
    const obj = objects.find(o => o.id === objectId);
    if (obj) {
      onFocusObject(objectId, obj.floor ?? 0);
    }
  }, [objects, onFocusObject]);

  const handleSelectBuilding = useCallback((buildingId: string) => {
    // In view-only mode, single click also focuses
    onFocusBuilding(buildingId);
  }, [onFocusBuilding]);

  // Check if there are any smart objects or buildings
  const hasContent = objects.length > 0 || buildings.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="absolute bottom-16 right-4 z-40 w-72">
      <div className={`
        rounded-xl overflow-hidden shadow-xl border backdrop-blur-md
        ${isDark 
          ? 'bg-gray-900/90 border-gray-700/60' 
          : 'bg-white/90 border-gray-200/80'
        }
      `}>
        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div 
                className="p-2 overflow-y-auto"
                style={{ maxHeight: maxExpandedHeight ? `${maxExpandedHeight}px` : '384px' }}
              >
                <SmartObjectsPanel
                  objects={objects}
                  buildings={buildings}
                  selectedIds={[]}
                  selectedBuildingId={null}
                  onSelectObject={handleSelectObject}
                  onSelectBuilding={handleSelectBuilding}
                  onFocusObject={(objectId, floor) => {
                    onFocusObject(objectId, floor);
                    setIsExpanded(false);
                  }}
                  onFocusBuilding={(buildingId) => {
                    onFocusBuilding(buildingId);
                    setIsExpanded(false);
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Toggle Button */}
        <div className="flex items-center gap-1 p-1.5">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 w-full
              ${isDark 
                ? 'bg-gray-800 hover:bg-gray-700 text-white' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
              }
            `}
            title="Search objects"
          >
            <MagnifyingGlassIcon className="w-4 h-4 text-primary-500" />
            <span className="font-semibold text-sm flex-1 text-left">
              Smart Objects
            </span>
            {isExpanded ? (
              <ChevronDownIcon className={`w-3 h-3 transition-transform ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            ) : (
              <ChevronUpIcon className={`w-3 h-3 transition-transform ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewerSmartObjectsPanel;

