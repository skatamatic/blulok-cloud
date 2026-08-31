/**
 * Build-in-3D Wizard — Stage 4: assemble scene and open in editor (no server save).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ExclamationCircleIcon, CubeIcon } from '@heroicons/react/24/outline';
import type { BuildWizardController } from '../useBuildWizard';

import {
  IMPORT_EDITOR_HANDOFF_STATE_KEY,
} from '@/components/bludesign/layout-import/importEditorHandoff';

interface Props {
  controller: BuildWizardController;
  isDark: boolean;
  onClose: () => void;
}

export const BuildStep: React.FC<Props> = ({ controller, isDark, onClose }) => {
  const navigate = useNavigate();

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm ${
    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`;

  const handleBuild = async () => {
    const handoff = await controller.buildAndOpen();
    if (handoff) {
      navigate('/bludesign/build', {
        state: { [IMPORT_EDITOR_HANDOFF_STATE_KEY]: handoff },
      });
      onClose();
    }
  };

  const stat = (label: string, value: React.ReactNode) => (
    <div className={`rounded-lg px-4 py-3 ${isDark ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
      <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</div>
      <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Scene name
        </label>
        <input
          className={inputCls}
          value={controller.sceneName}
          onChange={(e) => controller.setSceneName(e.target.value)}
          disabled={controller.buildBusy}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stat('Units placed', controller.unitsWithAsset)}
        {stat('Distinct assets', controller.buckets.length)}
        {stat('Bound to live data', controller.matchedCount)}
      </div>

      {controller.buildError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-error-500/10 text-error-500 text-sm">
          <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />
          <span>{controller.buildError}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleBuild()}
        disabled={controller.buildBusy || controller.unitsWithAsset === 0}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary-500 text-white transition-all hover:bg-primary-600 disabled:opacity-50"
      >
        <CubeIcon className="w-5 h-5" />
        {controller.buildBusy ? 'Building facility…' : 'Build & open in editor'}
      </button>
    </div>
  );
};
