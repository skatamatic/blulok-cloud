/**
 * Build-in-3D Wizard — Stage 1: scale calibration.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { EditableUnit } from '../../types';
import type { BuildWizardController } from '../useBuildWizard';
import {
  medianUnitFootprintFeet,
  metersPerPixelFromRatio,
  metersPerPixelFromUnit,
  type LengthUnit,
} from '../scale';

interface Props {
  units: EditableUnit[];
  controller: BuildWizardController;
  isDark: boolean;
}

type Mode = 'unit' | 'ratio';

export const ScaleStep: React.FC<Props> = ({ units, controller, isDark }) => {
  const labeled = useMemo(() => units.filter((u) => u.kind === 'unit' || u.label), [units]);
  const [mode, setMode] = useState<Mode>('unit');
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('ft');

  const [unitId, setUnitId] = useState<string>(labeled[0]?.id ?? '');
  const [realWidth, setRealWidth] = useState<string>('10');
  const [realDepth, setRealDepth] = useState<string>('20');

  const [pixelLength, setPixelLength] = useState<string>('100');
  const [realLength, setRealLength] = useState<string>('20');

  const selectedUnit = labeled.find((u) => u.id === unitId);

  useEffect(() => {
    let mpp = 0;
    if (mode === 'unit' && selectedUnit) {
      mpp = metersPerPixelFromUnit(selectedUnit, Number(realWidth), Number(realDepth), lengthUnit);
    } else if (mode === 'ratio') {
      mpp = metersPerPixelFromRatio(Number(realLength), lengthUnit, Number(pixelLength));
    }
    controller.setMetersPerPixel(Number.isFinite(mpp) && mpp > 0 ? mpp : 0);
  }, [mode, selectedUnit, realWidth, realDepth, lengthUnit, realLength, pixelLength, controller]);

  const sanity = medianUnitFootprintFeet(labeled, controller.metersPerPixel);

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm ${
    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`;
  const labelCls = `block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['unit', 'ratio'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-all ${
              mode === m
                ? 'border-primary-500 bg-primary-500/10'
                : isDark
                  ? 'border-gray-700 hover:border-gray-600'
                  : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {m === 'unit' ? 'Use a known unit size' : 'Use a measured length'}
            </div>
            <div className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {m === 'unit'
                ? 'Pick a unit and enter its real dimensions'
                : 'Enter how many real units a pixel span equals'}
            </div>
          </button>
        ))}
      </div>

      {/* Units toggle */}
      <div className="flex items-center gap-2">
        <span className={labelCls.replace('block ', '')}>Measurement units:</span>
        {(['ft', 'm'] as LengthUnit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setLengthUnit(u)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              lengthUnit === u
                ? 'bg-primary-500 text-white'
                : isDark
                  ? 'bg-gray-800 text-gray-300'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {u === 'ft' ? 'Feet' : 'Meters'}
          </button>
        ))}
      </div>

      {mode === 'unit' ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3">
            <label className={labelCls}>Reference unit</label>
            <select className={inputCls} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {labeled.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label || `(unlabeled ${u.id.slice(0, 4)})`} — {Math.round(u.bounds.width)}×
                  {Math.round(u.bounds.height)} px
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Real width ({lengthUnit})</label>
            <input className={inputCls} type="number" value={realWidth} onChange={(e) => setRealWidth(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Real depth ({lengthUnit})</label>
            <input className={inputCls} type="number" value={realDepth} onChange={(e) => setRealDepth(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Pixel size</label>
            <div className={`px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
              {selectedUnit ? `${Math.round(selectedUnit.bounds.width)}×${Math.round(selectedUnit.bounds.height)}` : '—'}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Measured length (pixels)</label>
            <input className={inputCls} type="number" value={pixelLength} onChange={(e) => setPixelLength(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Equals real length ({lengthUnit})</label>
            <input className={inputCls} type="number" value={realLength} onChange={(e) => setRealLength(e.target.value)} />
          </div>
        </div>
      )}

      {/* Sanity readout */}
      <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
        {controller.metersPerPixel > 0 ? (
          <div className="space-y-1">
            <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Scale: {(controller.metersPerPixel * 1000).toFixed(2)} mm / px
            </div>
            {sanity && (
              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                A typical unit works out to ~{sanity.widthFt.toFixed(1)} × {sanity.depthFt.toFixed(1)} ft. If that
                looks wrong, adjust the inputs above.
              </div>
            )}
          </div>
        ) : (
          <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Enter values above to calibrate the scale.
          </div>
        )}
      </div>
    </div>
  );
};
