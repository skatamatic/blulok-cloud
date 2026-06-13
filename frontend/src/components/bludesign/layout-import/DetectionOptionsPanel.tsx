/**
 * BluDesign Layout Import — Detection options panel
 *
 * Collapsible advanced controls that tune the detection engine before a re-run.
 * Only a curated subset of the engine's knobs are surfaced; omitted options fall
 * back to the backend defaults.
 */

import React, { useState } from 'react';
import { ChevronDownIcon, ArrowPathIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import type { DetectionOptions } from './types';

interface DetectionOptionsPanelProps {
  options: DetectionOptions;
  onChange: (options: DetectionOptions) => void;
  onReprocess: () => void;
  processing: boolean;
}

export const DetectionOptionsPanel: React.FC<DetectionOptionsPanelProps> = ({
  options,
  onChange,
  onReprocess,
  processing,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [open, setOpen] = useState(false);

  const set = (patch: Partial<DetectionOptions>) => onChange({ ...options, ...patch });

  const labelClass = `flex items-center justify-between text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`;

  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
    checked,
    onChange: onToggle,
  }) => (
    <button
      type="button"
      onClick={() => onToggle(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
        checked ? 'bg-primary-500' : isDark ? 'bg-gray-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );

  const sat = options.minColorSaturation ?? 0;
  const upscale = options.internalUpscaleTargetWidth ?? 4000;
  const closeKernel = options.borderCloseKernel ?? 3;

  return (
    <div className={`rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-3 py-2.5 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <AdjustmentsHorizontalIcon className="w-4 h-4 text-primary-500" />
          Detection settings
        </span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              <div className={labelClass}>
                <span>Read labels (OCR)</span>
                <Toggle
                  checked={options.runOcr ?? true}
                  onChange={(v) => set({ runOcr: v })}
                />
              </div>

              <div className={labelClass}>
                <span>Auto-exclude legend</span>
                <Toggle
                  checked={options.autoExcludeLegend ?? true}
                  onChange={(v) => set({ autoExcludeLegend: v })}
                />
              </div>

              <div>
                <div className={`${labelClass} mb-1`}>
                  <span>Edge gap tolerance</span>
                  <span className="tabular-nums">{closeKernel}px</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={7}
                  step={2}
                  value={closeKernel}
                  onChange={(e) => set({ borderCloseKernel: Number(e.target.value) })}
                  className="w-full accent-primary-500"
                />
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Higher seals bigger gaps in broken outlines, but can merge very
                  close cells.
                </p>
              </div>

              <div>
                <div className={`${labelClass} mb-1`}>
                  <span>Color strictness</span>
                  <span className="tabular-nums">{Math.round(sat * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.02}
                  value={sat}
                  onChange={(e) => set({ minColorSaturation: Number(e.target.value) })}
                  className="w-full accent-primary-500"
                />
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  0% keeps grey/faint cells (recommended). Higher rejects
                  greyscale regions — only for vividly colored plans.
                </p>
              </div>

              <div>
                <div className={`${labelClass} mb-1`}>
                  <span>Detail (upscale width)</span>
                  <span className="tabular-nums">{upscale}px</span>
                </div>
                <input
                  type="range"
                  min={2000}
                  max={8000}
                  step={400}
                  value={upscale}
                  onChange={(e) => set({ internalUpscaleTargetWidth: Number(e.target.value) })}
                  className="w-full accent-primary-500"
                />
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Working resolution for rectangle detection (capped at 4×). The
                  default (~2×) keeps cell borders clean and is fast; numbers are
                  enlarged separately per-cell for reading, so raising this rarely
                  helps and is slower.
                </p>
              </div>

              <button
                type="button"
                onClick={onReprocess}
                disabled={processing}
                className={`
                  w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                  transition-all duration-150 bg-primary-600 text-white
                  ${processing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-primary-700'}
                `}
              >
                <ArrowPathIcon className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                {processing ? 'Re-analyzing…' : 'Re-run detection'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
