/**
 * Hotkey Overlay
 * 
 * Fixed position overlay in the bottom-left showing contextual hotkeys.
 * Collapsible but not draggable. Renders above all floating panels.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { EditorTool } from '../core/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

const HOTKEY_COLLAPSED_KEY = 'bludesign-hotkey-overlay-collapsed';

interface HotkeyOverlayProps {
  activeTool: EditorTool;
  isPlacing?: boolean;
  hasSelection?: boolean;
  hasClipboard?: boolean;
}

interface HotkeyItem {
  key: string;
  description: string;
  modifier?: 'ctrl' | 'shift' | 'ctrl+shift';
}

// Key icon component
const KeyIcon: React.FC<{ 
  keyName: string; 
  isDark: boolean;
  modifier?: 'ctrl' | 'shift' | 'ctrl+shift';
}> = ({ keyName, isDark, modifier }) => {
  const renderKey = (name: string) => (
    <span className={`
      inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 
      rounded text-xs font-mono font-semibold
      ${isDark 
        ? 'bg-gray-700 text-gray-200 border border-gray-600 shadow-[0_2px_0_0_rgba(0,0,0,0.5)]' 
        : 'bg-gray-100 text-gray-700 border border-gray-300 shadow-[0_2px_0_0_rgba(0,0,0,0.1)]'
      }
    `}>
      {name}
    </span>
  );

  if (modifier) {
    const modifierParts = modifier.split('+');
    return (
      <span className="inline-flex items-center gap-0.5">
        {modifierParts.map((mod, i) => (
          <React.Fragment key={mod}>
            {renderKey(mod === 'ctrl' ? 'Ctrl' : 'Shift')}
            {i < modifierParts.length - 1 && <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>+</span>}
          </React.Fragment>
        ))}
        <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>+</span>
        {renderKey(keyName)}
      </span>
    );
  }

  return renderKey(keyName);
};

export const HotkeyOverlay: React.FC<HotkeyOverlayProps> = ({
  activeTool,
  isPlacing,
  hasSelection,
  hasClipboard,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  // Load collapsed state from localStorage (default to expanded)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(HOTKEY_COLLAPSED_KEY);
      return saved === 'true';
    } catch {
      return false;
    }
  });
  
  // Persist collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HOTKEY_COLLAPSED_KEY, String(isCollapsed));
    } catch {
      // Ignore localStorage errors
    }
  }, [isCollapsed]);

  // Get contextual hotkeys based on active tool and state - only show relevant ones
  const hotkeys = useMemo((): HotkeyItem[] => {
    const items: HotkeyItem[] = [];

    // PLACE tool hotkeys
    if (activeTool === EditorTool.PLACE && isPlacing) {
      items.push(
        { key: 'Q', description: 'Rotate Left' },
        { key: 'E', description: 'Rotate Right' },
        { key: 'Click', description: 'Place Asset' },
        { key: 'Drag', description: 'Paint/Fill Area' },
        { key: 'R-Click', description: 'Delete Object' },
        { key: 'Esc', description: 'Cancel' },
      );
    }

    // SELECT tool hotkeys
    if (activeTool === EditorTool.SELECT) {
      items.push(
        { key: 'Drag', description: 'Box Select' },
        { key: 'B', description: 'Building Tool' },
      );
      
      if (hasSelection) {
        items.push(
          { key: 'Del', description: 'Delete' },
          { key: 'C', description: 'Copy', modifier: 'ctrl' },
          { key: 'X', description: 'Cut', modifier: 'ctrl' },
        );
      }
      
      if (hasClipboard) {
        items.push({ key: 'V', description: 'Paste', modifier: 'ctrl' });
      }
    }

    // SELECT_BUILDING tool hotkeys
    if (activeTool === EditorTool.SELECT_BUILDING) {
      items.push(
        { key: 'Drag', description: 'Box Select' },
        { key: 'DblClick', description: 'Select Building' },
        { key: 'V', description: 'Object Select' },
      );
      
      if (hasSelection) {
        items.push(
          { key: 'Del', description: 'Delete Building' },
        );
      }
    }

    // Camera control (always relevant when in placement or selection)
    if (activeTool === EditorTool.PLACE || activeTool === EditorTool.SELECT || activeTool === EditorTool.SELECT_BUILDING) {
      items.push(
        { key: 'Drag', description: 'Rotate Camera', modifier: 'ctrl' },
        { key: '←/→', description: 'Orbit 90°', modifier: 'ctrl' },
      );
    }

    return items;
  }, [activeTool, isPlacing, hasSelection, hasClipboard]);

  return (
    <div 
      className="absolute bottom-4 left-4 z-[10000]"
      style={{ pointerEvents: 'auto' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`
          rounded-lg shadow-xl overflow-hidden backdrop-blur-md
          ${isDark 
            ? 'bg-gray-900/90 border border-gray-700' 
            : 'bg-white/90 border border-gray-200'
          }
        `}
        style={{ minWidth: 220 }}
      >
        {/* Header */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`
            w-full flex items-center justify-between px-3 py-2
            text-sm font-medium cursor-pointer
            ${isDark 
              ? 'text-gray-200 hover:bg-gray-800' 
              : 'text-gray-700 hover:bg-gray-100'
            }
          `}
        >
          <span>
            {activeTool === EditorTool.PLACE && isPlacing 
              ? 'Placement Controls' 
              : activeTool === EditorTool.SELECT 
                ? 'Selection Controls' 
                : activeTool === EditorTool.SELECT_BUILDING
                  ? 'Building Controls'
                  : 'Controls'}
          </span>
          {isCollapsed ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </button>

        {/* Content */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className={`
                px-3 pb-3 space-y-1.5
                max-h-[400px] overflow-y-auto
                ${isDark ? 'scrollbar-dark' : 'scrollbar-light'}
              `}>
                {hotkeys.map((hotkey, index) => (
                  <div
                    key={`${hotkey.key}-${hotkey.description}-${index}`}
                    className={`
                      flex items-center justify-between gap-3
                      text-xs py-1
                      ${isDark ? 'text-gray-300' : 'text-gray-600'}
                    `}
                  >
                    <span className="truncate">{hotkey.description}</span>
                    <KeyIcon 
                      keyName={hotkey.key} 
                      isDark={isDark}
                      modifier={hotkey.modifier}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default HotkeyOverlay;

