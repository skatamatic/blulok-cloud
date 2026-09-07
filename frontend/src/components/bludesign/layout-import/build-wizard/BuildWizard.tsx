/**
 * Build-in-3D Wizard — shell
 *
 * Full-screen multi-step modal that turns reviewed layout-import units into a
 * saved BluDesign 3D facility. Stages: scale -> assets -> units -> build.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import type { EditableUnit } from '../types';
import { useBuildWizard, WIZARD_STEPS, type WizardStep } from './useBuildWizard';
import { ScaleStep } from './steps/ScaleStep';
import { AssetsStep } from './steps/AssetsStep';
import { MatchStep } from './steps/MatchStep';
import { BuildStep } from './steps/BuildStep';

export interface BuildWizardProps {
  units: EditableUnit[];
  defaultSceneName?: string;
  source?: import('../loadSource').LoadedSource | null;
  onClose: () => void;
}

const STEP_SUBTITLES: Record<WizardStep, string> = {
  scale: 'Tell us the real-world size so the model is built to scale',
  assets: 'Generate reusable 3D storage-unit assets from the layout',
  match: 'Match diagram units to real units in a facility',
  build: 'Assemble the 3D facility and open it in the editor',
};

export const BuildWizard: React.FC<BuildWizardProps> = ({ units, defaultSceneName, source, onClose }) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const w = useBuildWizard({ units, defaultSceneName, source });

  const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === w.step);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (w.step === 'assets' && !w.assetsCreated && !w.assetsBusy && w.metersPerPixel > 0) {
      void w.generateAssets();
    }
  }, [w.step, w.assetsCreated, w.assetsBusy, w.metersPerPixel, w.generateAssets]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-wizard-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className={`relative w-full max-w-5xl max-h-[92vh] mx-4 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
          isDark ? 'bg-gray-900' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div
          className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <div>
            <h2
              id="build-wizard-title"
              className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}
            >
              Build in 3D
            </h2>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {STEP_SUBTITLES[w.step]}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close wizard"
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Step indicator */}
        <div className={`flex-shrink-0 px-6 py-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <div className="flex items-center">
            {WIZARD_STEPS.map((s, i) => {
              const done = i < currentIndex;
              const active = i === currentIndex;
              return (
                <React.Fragment key={s.id}>
                  <button
                    type="button"
                    onClick={() => (i <= currentIndex ? w.goStep(s.id) : undefined)}
                    className="flex items-center gap-2 group"
                    disabled={i > currentIndex}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span
                      className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-primary-500 text-white'
                          : done
                            ? 'bg-primary-500/20 text-primary-500'
                            : isDark
                              ? 'bg-gray-800 text-gray-500'
                              : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {done ? <CheckIcon className="w-4 h-4" /> : i + 1}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        active
                          ? isDark
                            ? 'text-white'
                            : 'text-gray-900'
                          : isDark
                            ? 'text-gray-500'
                            : 'text-gray-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < WIZARD_STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-px mx-3 ${
                        i < currentIndex ? 'bg-primary-500/40' : isDark ? 'bg-gray-800' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={w.step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {w.step === 'scale' && <ScaleStep units={units} controller={w} isDark={isDark} />}
              {w.step === 'assets' && <AssetsStep controller={w} isDark={isDark} />}
              {w.step === 'match' && <MatchStep units={units} controller={w} isDark={isDark} />}
              {w.step === 'build' && <BuildStep controller={w} isDark={isDark} onClose={onClose} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div
          className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-t ${
            isDark ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <button
            type="button"
            onClick={currentIndex === 0 ? onClose : w.goBack}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDark ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {currentIndex === 0 ? 'Cancel' : 'Back'}
          </button>

          {w.step !== 'build' && (
            <button
              type="button"
              onClick={w.goNext}
              disabled={!w.canGoNext}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-primary-500 text-white transition-all hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
