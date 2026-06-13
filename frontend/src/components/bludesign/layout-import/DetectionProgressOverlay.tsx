/**
 * BluDesign Layout Import — full-screen import progress overlay
 *
 * Blocks interaction while detection and post-processing run. Shows every
 * pipeline step with determinate % when available (unit finding + OCR).
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  IMPORT_PIPELINE_STEPS,
  type DetectionProgress,
  type ImportPipelineStage,
} from './types';

interface DetectionProgressOverlayProps {
  progress: DetectionProgress;
  isDark: boolean;
  onCancel?: () => void;
}

function stepStatus(
  stepId: ImportPipelineStage,
  active: ImportPipelineStage
): 'done' | 'active' | 'pending' {
  const stepIdx = IMPORT_PIPELINE_STEPS.findIndex((s) => s.id === stepId);
  const activeIdx = IMPORT_PIPELINE_STEPS.findIndex((s) => s.id === active);
  if (stepIdx < activeIdx) return 'done';
  if (stepIdx === activeIdx) return 'active';
  return 'pending';
}

function progressDetail(progress: DetectionProgress): string | null {
  const { stage, total, done, detail } = progress;
  if (detail) return detail;
  if (total <= 0) return null;
  if (stage === 'finding') {
    return `${done} / ${total} analysis passes`;
  }
  if (stage === 'reading') {
    return `${done} / ${total} label${total === 1 ? '' : 's'} read`;
  }
  return null;
}

export const DetectionProgressOverlay: React.FC<DetectionProgressOverlayProps> = ({
  progress,
  isDark,
  onCancel,
}) => {
  const { stage, total, done } = progress;
  const activeStep = IMPORT_PIPELINE_STEPS.find((s) => s.id === stage);
  const determinate =
    (stage === 'finding' || stage === 'reading') && total > 0;
  const pct = determinate ? Math.round((done / total) * 100) : null;
  const subDetail = progressDetail(progress);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-progress-title"
      aria-busy="true"
    >
      <div
        className={`absolute inset-0 ${
          isDark ? 'bg-gray-950/80' : 'bg-gray-900/40'
        }`}
        style={{ backdropFilter: 'blur(8px)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={`relative w-full max-w-md rounded-2xl border shadow-soft-lg px-6 py-5 ${
          isDark
            ? 'bg-gray-900/95 border-gray-800 text-gray-100'
            : 'bg-white/95 border-gray-200 text-gray-900'
        }`}
      >
        <div className="flex items-start gap-3 mb-5">
          <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-primary-500" />
            <span className="absolute inset-0 rounded-full border-2 border-primary-500/25 border-t-primary-500 animate-spin" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="import-progress-title" className="text-base font-semibold leading-tight">
              Analyzing your plan
            </h2>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {activeStep?.detail ?? 'Working…'}
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel import"
              title="Cancel import"
              className={`rounded-lg p-1.5 transition-colors ${
                isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <ol className="space-y-2.5" aria-label="Import progress steps">
          {IMPORT_PIPELINE_STEPS.map((step) => {
            const status = stepStatus(step.id, stage);
            const isActive = status === 'active';
            const showBar = isActive && determinate;
            const stepPct = showBar && pct !== null ? pct : null;

            return (
              <li
                key={step.id}
                className={`rounded-xl px-3 py-2.5 transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-primary-500/10 ring-1 ring-primary-500/30'
                      : 'bg-primary-500/5 ring-1 ring-primary-500/20'
                    : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <StepIndicator status={status} isDark={isDark} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium leading-tight ${
                        status === 'pending'
                          ? isDark
                            ? 'text-gray-500'
                            : 'text-gray-400'
                          : ''
                      }`}
                    >
                      {step.label}
                    </p>
                    {isActive && subDetail && (
                      <p className={`text-xs mt-0.5 tabular-nums ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {subDetail}
                      </p>
                    )}
                  </div>
                  {stepPct !== null && (
                    <span className="text-sm font-bold tabular-nums text-primary-500">{stepPct}%</span>
                  )}
                </div>

                {showBar && (
                  <div
                    className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${
                      isDark ? 'bg-gray-800' : 'bg-gray-100'
                    }`}
                  >
                    <motion.div
                      className="h-full rounded-full bg-primary-500"
                      initial={false}
                      animate={{ width: `${stepPct}%` }}
                      transition={{ ease: 'easeOut', duration: 0.25 }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </motion.div>
    </motion.div>
  );
};

const StepIndicator: React.FC<{
  status: 'done' | 'active' | 'pending';
  isDark: boolean;
}> = ({ status, isDark }) => {
  if (status === 'done') {
    return (
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
        <CheckIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
        <span className="h-2 w-2 rounded-full bg-primary-500" />
      </span>
    );
  }
  return (
    <span
      className={`h-6 w-6 flex-shrink-0 rounded-full border-2 ${
        isDark ? 'border-gray-700' : 'border-gray-200'
      }`}
    />
  );
};
