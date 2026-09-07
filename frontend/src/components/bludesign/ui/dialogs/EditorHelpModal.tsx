/**
 * Editor Help Modal — selection controls and keyboard shortcuts (Help menu).
 */

import React from 'react';
import { XMarkIcon, CommandLineIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import {
  EDITOR_HELP_SECTIONS,
  type ContextualHotkey,
} from '../editorContextualHotkeys';

interface EditorHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyBadge: React.FC<{
  hotkey: ContextualHotkey;
  isDark: boolean;
}> = ({ hotkey, isDark }) => {
  const renderKey = (name: string) => (
    <kbd
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none ${
        isDark
          ? 'border border-gray-600 bg-gray-800 text-gray-200'
          : 'border border-gray-300 bg-gray-100 text-gray-700'
      }`}
    >
      {name}
    </kbd>
  );

  const modifierLabel = (mod: string) => {
    if (mod === 'alt') return 'Alt';
    if (mod === 'shift') return 'Shift';
    return mod.charAt(0).toUpperCase() + mod.slice(1);
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      {hotkey.modifier &&
        hotkey.modifier.split('+').map((mod, i, parts) => (
          <React.Fragment key={mod}>
            {renderKey(modifierLabel(mod))}
            {i < parts.length - 1 && (
              <span className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>+</span>
            )}
          </React.Fragment>
        ))}
      {hotkey.modifier && (
        <span className={`text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>+</span>
      )}
      {renderKey(hotkey.key)}
    </span>
  );
};

export const EditorHelpModal: React.FC<EditorHelpModalProps> = ({ isOpen, onClose }) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full max-w-md max-h-[min(80vh,560px)] flex flex-col rounded-xl shadow-2xl overflow-hidden ${
          isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-help-title"
      >
        <div
          className={`flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ${
            isDark ? 'border-gray-700 bg-gray-800/80' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CommandLineIcon
              className={`w-5 h-5 ${isDark ? 'text-primary-400' : 'text-primary-600'}`}
              aria-hidden
            />
            <h2
              id="editor-help-title"
              className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
            >
              Selection Controls
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
            }`}
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {EDITOR_HELP_SECTIONS.map((section) => (
            <section key={section.title}>
              <h3
                className={`text-[11px] font-semibold uppercase tracking-wide mb-2 ${
                  isDark ? 'text-primary-400' : 'text-primary-600'
                }`}
              >
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.hotkeys.map((hotkey, index) => (
                  <li
                    key={`${section.title}-${hotkey.description}-${index}`}
                    className={`flex items-center justify-between gap-3 text-sm ${
                      isDark ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    <span>{hotkey.description}</span>
                    <KeyBadge hotkey={hotkey} isDark={isDark} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          className={`flex-shrink-0 px-5 py-3 border-t text-xs ${
            isDark ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'
          }`}
        >
          Use the Select tool filter in the Tools panel to limit what gets selected.
        </div>
      </div>
    </div>
  );
};
