/**
 * Slide-in view settings panel for the Facility 3D View widget.
 * Draft changes are applied live to the viewer; OK commits, Cancel reverts.
 */

import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import {
  SKY_PRESETS,
  GROUND_PRESETS,
  SkyPresetId,
  GroundPresetId,
} from '@/components/bludesign/core/environment/ScenePresets';
import type {
  FacilityViewerEnvironmentOptions,
  FacilityViewerWidgetConfig,
} from '@/types/widget.types';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { EnvironmentFineTuneControls } from './EnvironmentFineTuneControls';

export interface ViewSettingsPanelProps {
  isOpen: boolean;
  skyPreset: SkyPresetId;
  groundPreset: GroundPresetId;
  environmentOptions?: FacilityViewerEnvironmentOptions;
  onDraftChange: (patch: Partial<FacilityViewerWidgetConfig>) => void;
  onApply: () => void;
  onCancel: () => void;
}

interface PresetCardProps {
  label: string;
  description: string;
  swatchClass: string;
  selected: boolean;
  onClick: () => void;
  isDark: boolean;
  compact?: boolean;
}

const PresetCard: React.FC<PresetCardProps> = ({
  label,
  description,
  swatchClass,
  selected,
  onClick,
  isDark,
  compact = false,
}) => (
  <motion.button
    type="button"
    aria-pressed={selected}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`
      relative flex flex-col rounded-lg border-2 overflow-hidden text-left transition-shadow
      ${selected
        ? 'border-[#147FD4] shadow-md shadow-[#147FD4]/20 ring-1 ring-[#147FD4]/30'
        : isDark
          ? 'border-gray-700 hover:border-gray-600'
          : 'border-gray-200 hover:border-gray-300'
      }
    `}
  >
    <div className={`${compact ? 'h-10' : 'h-12'} w-full bg-gradient-to-br ${swatchClass}`} />
    <div className={`px-2 py-2 ${isDark ? 'bg-gray-800/90' : 'bg-white'}`}>
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {label}
        </span>
        {selected && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#147FD4] text-white">
            <CheckIcon className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
      {!compact && (
        <p className={`mt-0.5 text-[10px] leading-snug line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {description}
        </p>
      )}
    </div>
  </motion.button>
);

export const ViewSettingsPanel: React.FC<ViewSettingsPanelProps> = ({
  isOpen,
  skyPreset,
  groundPreset,
  environmentOptions,
  onDraftChange,
  onApply,
  onCancel,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
          <motion.aside
            role="dialog"
            aria-modal="false"
            aria-labelledby="view-settings-panel-title"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className={`
              absolute left-0 top-0 bottom-0 z-30 flex w-[min(100%,28rem)] flex-col
              border-r shadow-2xl
              ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}
            `}
          >
            <header
              className={`flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 ${
                isDark ? 'border-gray-700' : 'border-gray-200'
              }`}
            >
              <div>
                <h2
                  id="view-settings-panel-title"
                  className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
                >
                  View settings
                </h2>
                <p className={`mt-0.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Tweak settings here while orbiting the scene. OK saves to this dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel view settings"
                className={`rounded-md p-1 transition-colors ${
                  isDark
                    ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-5">
              <section>
                <h3
                  className={`text-xs font-semibold uppercase tracking-wider mb-2.5 ${
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  Sky
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {SKY_PRESETS.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      label={preset.label}
                      description={preset.description}
                      swatchClass={preset.swatchClass}
                      selected={skyPreset === preset.id}
                      onClick={() => onDraftChange({ skyPreset: preset.id })}
                      isDark={isDark}
                      compact
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3
                  className={`text-xs font-semibold uppercase tracking-wider mb-2.5 ${
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  Ground
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {GROUND_PRESETS.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      label={preset.label}
                      description={preset.description}
                      swatchClass={preset.swatchClass}
                      selected={groundPreset === preset.id}
                      onClick={() => onDraftChange({ groundPreset: preset.id })}
                      isDark={isDark}
                      compact
                    />
                  ))}
                </div>
              </section>

              <EnvironmentFineTuneControls
                skyPreset={skyPreset}
                groundPreset={groundPreset}
                environmentOptions={environmentOptions}
                isDark={isDark}
                onChange={onDraftChange}
              />
            </div>

            <footer
              className={`flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3 ${
                isDark ? 'border-gray-700 bg-gray-900/95' : 'border-gray-200 bg-white/95'
              }`}
            >
              <button
                type="button"
                onClick={onCancel}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  isDark
                    ? 'text-gray-300 hover:bg-gray-800'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onApply}
                className="rounded-lg px-3.5 py-2 text-sm font-medium bg-[#147FD4] text-white hover:bg-[#1269b0] transition-colors"
              >
                OK
              </button>
            </footer>
          </motion.aside>
      )}
    </AnimatePresence>
  );
};
