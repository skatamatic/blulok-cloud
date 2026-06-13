/**
 * BluDesign Layout Import — Problems overlay (canvas)
 *
 * Floating, expandable panel over the image canvas listing validation problems
 * (missing labels, duplicates). Hidden entirely when there are no problems.
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ExclamationCircleIcon,
  ChevronDownIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import type { EditableUnit } from './types';
import type { LayoutError } from './useLayoutImport';

interface ProblemsOverlayProps {
  errors: LayoutError[];
  units: EditableUnit[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export const ProblemsOverlay: React.FC<ProblemsOverlayProps> = ({
  errors,
  units,
  selectedIds,
  onSelect,
  onHover,
  onDelete,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [open, setOpen] = useState(false);

  if (errors.length === 0) return null;

  const unitById = new Map(units.map((u) => [u.id, u]));

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col items-start pointer-events-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold shadow-soft-lg border transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] ${
          isDark
            ? 'bg-gray-900/95 border-error-500/40 text-error-300'
            : 'bg-white/95 border-error-300 text-error-700'
        }`}
        style={{ backdropFilter: 'blur(8px)' }}
      >
        <ExclamationCircleIcon className="w-4 h-4" />
        {errors.length} problem{errors.length === 1 ? '' : 's'}
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={`pointer-events-auto mt-2 w-72 max-h-64 overflow-hidden rounded-xl border shadow-soft-lg ${
              isDark ? 'bg-gray-900/95 border-error-500/30' : 'bg-white/95 border-error-200'
            }`}
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <div className="px-2 py-2 space-y-0.5 overflow-y-auto max-h-64">
              {errors.map((err) => {
                const unit = unitById.get(err.unitId);
                const isSel = selectedIds.has(err.unitId);
                return (
                  <div
                    key={err.id}
                    onMouseEnter={() => onHover(err.unitId)}
                    onMouseLeave={() => onHover(null)}
                    className={`group flex items-center gap-2 rounded-lg pl-2 pr-1 py-1.5 transition-colors ${
                      isSel
                        ? isDark
                          ? 'bg-error-500/20'
                          : 'bg-error-100'
                        : isDark
                          ? 'hover:bg-error-500/10'
                          : 'hover:bg-error-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(err.unitId)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className={`text-xs font-medium truncate ${isDark ? 'text-error-200' : 'text-error-700'}`}>
                        {err.message}
                      </p>
                      <p className={`text-[10px] ${isDark ? 'text-error-400/70' : 'text-error-500/80'}`}>
                        {unit?.label ? `Unit ${unit.label}` : 'Unlabeled box'} · click to locate
                      </p>
                    </button>
                    <button
                      type="button"
                      title="Delete box"
                      onClick={() => onDelete(err.unitId)}
                      className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
                        isDark ? 'text-error-300 hover:bg-error-500/20' : 'text-error-600 hover:bg-error-200'
                      }`}
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
