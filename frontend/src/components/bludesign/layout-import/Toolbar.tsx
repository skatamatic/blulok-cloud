/**
 * BluDesign Layout Import — canvas toolbar
 *
 * Tool selection (select / add), undo-redo, and quick view toggles for the
 * review canvas. Presentational; all state lives in the parent controller.
 */

import React from 'react';
import {
  CursorArrowRaysIcon,
  PlusIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  TagIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import type { EditorTool } from './types';

interface ToolbarProps {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showImage: boolean;
  onToggleImage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
}

const TOOLS: { id: EditorTool; label: string; hint: string; icon: typeof PlusIcon }[] = [
  { id: 'select', label: 'Select', hint: 'Select & edit units (V)', icon: CursorArrowRaysIcon },
  { id: 'add', label: 'Add', hint: 'Draw a new unit (A)', icon: PlusIcon },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  tool,
  onToolChange,
  showLabels,
  onToggleLabels,
  showImage,
  onToggleImage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled = false,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const groupClass = `flex items-center gap-1 p-1 rounded-xl ${
    isDark ? 'bg-gray-800/70' : 'bg-gray-100'
  }`;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2 border-b
        ${isDark ? 'bg-gray-900/80 border-gray-800' : 'bg-white/90 border-gray-200'}
        backdrop-blur-sm
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      {/* Tools */}
      <div className={groupClass}>
        {TOOLS.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              disabled={disabled}
              onClick={() => onToolChange(t.id)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium
                transition-all duration-150
                ${active
                  ? 'bg-primary-500 text-white shadow-sm'
                  : isDark
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-600 hover:bg-white hover:shadow-sm'
                }
              `}
            >
              <t.icon className="w-4 h-4" />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Undo / redo */}
      <div className={groupClass}>
        <IconButton isDark={isDark} title="Undo (Alt+Z)" disabled={disabled || !canUndo} onClick={onUndo}>
          <ArrowUturnLeftIcon className="w-4 h-4" />
        </IconButton>
        <IconButton isDark={isDark} title="Redo (Alt+Y)" disabled={disabled || !canRedo} onClick={onRedo}>
          <ArrowUturnRightIcon className="w-4 h-4" />
        </IconButton>
      </div>

      {/* View toggles */}
      <button
        type="button"
        title="Toggle unit labels"
        disabled={disabled}
        onClick={onToggleLabels}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium
          transition-all duration-150 border
          ${showLabels
            ? 'border-primary-500/40 bg-primary-500/10 text-primary-500'
            : isDark
              ? 'border-gray-700 text-gray-400 hover:bg-gray-800'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }
        `}
      >
        <TagIcon className="w-4 h-4" />
        <span className="hidden lg:inline">Labels</span>
      </button>
      <button
        type="button"
        title={showImage ? 'Hide plan image (overlay only)' : 'Show plan image'}
        disabled={disabled}
        onClick={onToggleImage}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium
          transition-all duration-150 border
          ${showImage
            ? isDark
              ? 'border-gray-700 text-gray-400 hover:bg-gray-800'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            : 'border-primary-500/40 bg-primary-500/10 text-primary-500'
          }
        `}
      >
        {showImage ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
        <span className="hidden lg:inline">Image</span>
      </button>

      <div className="flex-1" />

      <div className={`hidden md:flex items-center gap-3 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        <span>Scroll to zoom · Right-drag or drag empty space to pan · Shift-drag to select</span>
      </div>
    </div>
  );
};

const IconButton: React.FC<{
  isDark: boolean;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ isDark, title, disabled, onClick, children }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`
      flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150
      ${disabled
        ? 'opacity-40 cursor-not-allowed'
        : isDark
          ? 'text-gray-300 hover:bg-gray-700'
          : 'text-gray-600 hover:bg-white hover:shadow-sm'
      }
    `}
  >
    {children}
  </button>
);
