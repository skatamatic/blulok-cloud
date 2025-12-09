/**
 * Toolbox Panel
 * 
 * Contains tool selection and asset placement tools.
 * Renders as embedded content - wrap with FloatingPanel for standalone use.
 */

import React from 'react';
import {
  CursorArrowRaysIcon,
  CubeIcon,
  ArrowsPointingOutIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import { EditorTool } from '../../core/types';
import { useTheme } from '@/contexts/ThemeContext';

// Selection filter type (must match SelectionManager)
export type SelectionFilter = 'all' | 'smart' | 'visual';

interface ToolboxPanelProps {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  disabled?: boolean;
  selectionFilter?: SelectionFilter;
  onFilterChange?: (filter: SelectionFilter) => void;
}

export const ToolboxPanel: React.FC<ToolboxPanelProps> = ({
  activeTool,
  onToolChange,
  disabled = false,
  selectionFilter = 'all',
  onFilterChange,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  // Whether to show selection filter controls
  const showSelectionFilters = activeTool === EditorTool.SELECT;
  
  const tools = [
    { id: EditorTool.SELECT, label: 'Select', icon: CursorArrowRaysIcon, shortcut: 'V' },
    { id: EditorTool.SELECT_BUILDING, label: 'Building', icon: BuildingOffice2Icon, shortcut: 'B' },
    { id: EditorTool.PLACE, label: 'Place', icon: CubeIcon, shortcut: 'P' },
    { id: EditorTool.MOVE, label: 'Move', icon: ArrowsPointingOutIcon, shortcut: 'M' },
  ];

  return (
    <div className="space-y-3">
      {/* Tool Buttons */}
      <div className="space-y-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`
              flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md font-medium
              transition-all duration-150
              ${activeTool === tool.id
                ? 'bg-primary-600 text-white shadow-sm'
                : isDark
                  ? 'bg-gray-700/40 text-gray-300 hover:bg-gray-600/50 hover:text-white'
                  : 'bg-gray-200/60 text-gray-700 hover:bg-gray-300/60 hover:text-gray-900'
              }
              ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
            `}
            onClick={() => !disabled && onToolChange(tool.id)}
            disabled={disabled}
          >
            <tool.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate flex-1 text-left">{tool.label}</span>
            <kbd className={`px-1 py-0.5 rounded text-[10px] ${
              activeTool === tool.id
                ? 'bg-primary-700/50 text-primary-200'
                : isDark
                  ? 'bg-gray-800/60 text-gray-400'
                  : 'bg-gray-300/60 text-gray-500'
            }`}>
              {tool.shortcut}
            </kbd>
          </button>
        ))}
      </div>
      
      {/* Selection Filter Controls (when Select tool is active) */}
      {showSelectionFilters && onFilterChange && (
        <div className={`
          rounded-lg p-2.5
          backdrop-blur-sm border
          transition-all duration-300
          overflow-hidden
          ${isDark 
            ? 'bg-gray-800/70 border-gray-700/50' 
            : 'bg-white/80 border-gray-200/70'
          }
        `}>
          <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${
            isDark ? 'text-gray-500' : 'text-gray-400'
          }`}>
            Select Filter
          </div>
          <div className="flex gap-1">
            {([
              { value: 'all' as SelectionFilter, label: 'All' },
              { value: 'smart' as SelectionFilter, label: 'Smart' },
              { value: 'visual' as SelectionFilter, label: 'Decor' },
            ]).map(({ value, label }) => (
              <button
                type="button"
                key={value}
                className={`
                  flex-1 px-2 py-1.5 text-[10px] rounded font-medium
                  transition-all duration-150
                  ${selectionFilter === value
                    ? 'bg-primary-600 text-white shadow-sm'
                    : isDark
                      ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 hover:text-white'
                      : 'bg-gray-200/60 text-gray-600 hover:bg-gray-300/60 hover:text-gray-900'
                  }
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterChange(value);
                }}
                title={
                  value === 'all' ? 'Select all objects' :
                  value === 'smart' ? 'Select only smart objects (units, gates, etc.)' :
                  'Select only decorative objects'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
