/**
 * Toolbox Panel
 *
 * Contains tool selection and asset placement tools.
 * Renders as embedded content - wrap with FloatingPanel for standalone use.
 */

import React, { useEffect, useState } from 'react';
import {
  CursorArrowRaysIcon,
  CubeIcon,
  ArrowsPointingOutIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { EditorTool } from '../../core/types';
import { useTheme } from '@/contexts/ThemeContext';

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
  const [selectFilterOpen, setSelectFilterOpen] = useState(true);

  useEffect(() => {
    if (activeTool === EditorTool.SELECT) {
      setSelectFilterOpen(true);
    }
  }, [activeTool]);

  const tools = [
    { id: EditorTool.SELECT, label: 'Select', icon: CursorArrowRaysIcon, shortcut: 'V' },
    { id: EditorTool.SELECT_BUILDING, label: 'Building', icon: BuildingOffice2Icon, shortcut: 'B' },
    { id: EditorTool.PLACE, label: 'Place', icon: CubeIcon, shortcut: 'P' },
    { id: EditorTool.MOVE, label: 'Move', icon: ArrowsPointingOutIcon, shortcut: 'M' },
  ];

  const showSelectFilter = activeTool === EditorTool.SELECT && !!onFilterChange;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {tools.map((tool) => (
          <React.Fragment key={tool.id}>
            <div className="flex items-stretch gap-0.5">
              <button
                className={`
                  flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 text-xs rounded-md font-medium
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
                <kbd
                  className={`px-1 py-0.5 rounded text-[10px] ${
                    activeTool === tool.id
                      ? 'bg-primary-700/50 text-primary-200'
                      : isDark
                        ? 'bg-gray-800/60 text-gray-400'
                        : 'bg-gray-300/60 text-gray-500'
                  }`}
                >
                  {tool.shortcut}
                </kbd>
              </button>

              {tool.id === EditorTool.SELECT && showSelectFilter && (
                <button
                  type="button"
                  className={`flex-shrink-0 px-1.5 rounded-md transition-colors ${
                    isDark
                      ? 'bg-gray-700/40 text-gray-400 hover:bg-gray-600/50 hover:text-white'
                      : 'bg-gray-200/60 text-gray-500 hover:bg-gray-300/60 hover:text-gray-900'
                  }`}
                  onClick={() => setSelectFilterOpen((open) => !open)}
                  aria-expanded={selectFilterOpen}
                  aria-label={selectFilterOpen ? 'Collapse select filter' : 'Expand select filter'}
                >
                  <ChevronDownIcon
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      selectFilterOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              )}
            </div>

            {tool.id === EditorTool.SELECT && showSelectFilter && selectFilterOpen && (
              <div
                className={`ml-3 pl-2 border-l space-y-2 py-1 ${
                  isDark ? 'border-gray-700' : 'border-gray-200'
                }`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    isDark ? 'text-gray-500' : 'text-gray-400'
                  }`}
                >
                  Select Filter
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      { value: 'all' as SelectionFilter, label: 'All' },
                      { value: 'smart' as SelectionFilter, label: 'Smart' },
                      { value: 'visual' as SelectionFilter, label: 'Decor' },
                    ] as const
                  ).map(({ value, label }) => (
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
                      onClick={() => onFilterChange?.(value)}
                      title={
                        value === 'all'
                          ? 'Select all objects'
                          : value === 'smart'
                            ? 'Select only smart objects (units, gates, etc.)'
                            : 'Select only decorative objects'
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
