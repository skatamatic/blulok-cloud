/**
 * View settings modal for Facility 3D View widget (sky + ground presets).
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Modal } from '@/components/Modal/Modal';
import { useTheme } from '@/contexts/ThemeContext';
import {
  SKY_PRESETS,
  GROUND_PRESETS,
  SkyPresetId,
  GroundPresetId,
} from '@/components/bludesign/core/environment/ScenePresets';
import type { FacilityViewerWidgetConfig } from '@/types/widget.types';
import { CheckIcon } from '@heroicons/react/24/solid';

interface ViewSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skyPreset: SkyPresetId;
  groundPreset: GroundPresetId;
  onChange: (patch: Partial<FacilityViewerWidgetConfig>) => void;
}

interface PresetCardProps {
  label: string;
  description: string;
  swatchClass: string;
  selected: boolean;
  onClick: () => void;
  isDark: boolean;
}

const PresetCard: React.FC<PresetCardProps> = ({
  label,
  description,
  swatchClass,
  selected,
  onClick,
  isDark,
}) => (
  <motion.button
    type="button"
    aria-pressed={selected}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`
      relative flex flex-col rounded-xl border-2 overflow-hidden text-left transition-shadow
      ${selected
        ? 'border-[#147FD4] shadow-lg shadow-[#147FD4]/20 ring-2 ring-[#147FD4]/30'
        : isDark
          ? 'border-gray-700 hover:border-gray-600'
          : 'border-gray-200 hover:border-gray-300'
      }
    `}
  >
    <div className={`h-14 w-full bg-gradient-to-br ${swatchClass}`} />
    <div className={`px-3 py-2.5 ${isDark ? 'bg-gray-800/90' : 'bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {label}
        </span>
        {selected && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#147FD4] text-white">
            <CheckIcon className="h-3 w-3" />
          </span>
        )}
      </div>
      <p className={`mt-0.5 text-xs leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        {description}
      </p>
    </div>
  </motion.button>
);

export const ViewSettingsModal: React.FC<ViewSettingsModalProps> = ({
  isOpen,
  onClose,
  skyPreset,
  groundPreset,
  onChange,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="View settings" size="lg">
      <div className="space-y-6">
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Customize the 3D viewer appearance. Settings are saved with this dashboard and apply
          when the template is assigned.
        </p>

        <section>
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Sky
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SKY_PRESETS.map((preset) => (
              <PresetCard
                key={preset.id}
                label={preset.label}
                description={preset.description}
                swatchClass={preset.swatchClass}
                selected={skyPreset === preset.id}
                onClick={() => onChange({ skyPreset: preset.id })}
                isDark={isDark}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Ground
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {GROUND_PRESETS.map((preset) => (
              <PresetCard
                key={preset.id}
                label={preset.label}
                description={preset.description}
                swatchClass={preset.swatchClass}
                selected={groundPreset === preset.id}
                onClick={() => onChange({ groundPreset: preset.id })}
                isDark={isDark}
              />
            ))}
          </div>
        </section>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#147FD4] text-white hover:bg-[#1269b0] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};
