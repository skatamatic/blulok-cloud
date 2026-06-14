/**
 * Build-in-3D Wizard — Stage 3: facility select + name matching.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { EditableUnit } from '../../types';
import { compareUnitsByLabel } from '../../unitLabelSort';
import type { BuildWizardController } from '../useBuildWizard';

interface Props {
  units: EditableUnit[];
  controller: BuildWizardController;
  isDark: boolean;
}

export const MatchStep: React.FC<Props> = ({ units, controller, isDark }) => {
  const labeled = useMemo(() => units.filter((u) => u.kind === 'unit' || u.label), [units]);
  const sortedLabeled = useMemo(() => {
    const order = new Map<string, number>();
    labeled.forEach((u, i) => order.set(u.id, i));
    return [...labeled].sort((a, b) => compareUnitsByLabel(a, b, order));
  }, [labeled]);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);

  useEffect(() => {
    if (controller.facilities.length === 0) void controller.loadFacilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputCls = `px-3 py-2 rounded-lg border text-sm ${
    isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`;

  const visible = onlyUnmatched
    ? sortedLabeled.filter((u) => !controller.assignments[u.id])
    : sortedLabeled;
  const unbound = sortedLabeled.length - controller.matchedCount;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Facility</label>
        <select
          className={`${inputCls} min-w-[260px]`}
          value={controller.facilityId ?? ''}
          onChange={(e) => void controller.selectFacility(e.target.value)}
          disabled={controller.facilitiesBusy}
        >
          <option value="" disabled>
            {controller.facilitiesBusy ? 'Loading facilities…' : 'Select a facility…'}
          </option>
          {controller.facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.city ? ` — ${f.city}` : ''}
            </option>
          ))}
        </select>
      </div>
      {controller.facilitiesError && (
        <div className={`flex items-center justify-between gap-2 text-sm ${isDark ? 'text-error-400' : 'text-error-600'}`}>
          <span>{controller.facilitiesError}</span>
          <button
            type="button"
            onClick={() => void controller.loadFacilities()}
            className={`text-xs font-medium underline ${isDark ? 'text-primary-400' : 'text-primary-600'}`}
          >
            Retry
          </button>
        </div>
      )}
      {controller.matchError && (
        <p className={`text-sm ${isDark ? 'text-error-400' : 'text-error-600'}`}>{controller.matchError}</p>
      )}

      {controller.facilityId && (
        <>
          <div className="flex items-center justify-between">
            <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {controller.matchBusy ? (
                'Matching units…'
              ) : (
                <>
                  <span className="font-semibold text-primary-500">{controller.matchedCount}</span> matched ·{' '}
                  <span className="font-semibold">{unbound}</span> unbound (placed without live data)
                </>
              )}
            </div>
            <label className={`flex items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              <input
                type="checkbox"
                checked={onlyUnmatched}
                onChange={(e) => setOnlyUnmatched(e.target.checked)}
                className="accent-primary-500"
              />
              Show only unmatched
            </label>
          </div>

          <div
            className={`rounded-xl border overflow-hidden ${isDark ? 'border-gray-800' : 'border-gray-200'}`}
          >
            <div
              className={`grid grid-cols-[1fr_1.5fr] gap-2 px-4 py-2 text-xs font-semibold ${
                isDark ? 'bg-gray-800/60 text-gray-400' : 'bg-gray-50 text-gray-500'
              }`}
            >
              <div>Diagram unit</div>
              <div>Real unit</div>
            </div>
            <div className="max-h-[42vh] overflow-y-auto">
              {visible.map((u) => {
                const ranked = controller.candidates[u.id] ?? [];
                const selected = controller.assignments[u.id] ?? '';
                const best = ranked[0];
                return (
                  <div
                    key={u.id}
                    className={`grid grid-cols-[1fr_1.5fr] gap-2 items-center px-4 py-2 border-t ${
                      isDark ? 'border-gray-800' : 'border-gray-100'
                    }`}
                  >
                    <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                      {u.label || <span className="italic text-gray-400">(unlabeled)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        className={`${inputCls} flex-1`}
                        value={selected}
                        onChange={(e) => controller.setAssignment(u.id, e.target.value || null)}
                      >
                        <option value="">— Unbound —</option>
                        {ranked.map((c) => (
                          <option key={c.unitId} value={c.unitId}>
                            {c.unitNumber}
                            {c.score > 0 ? ` (${Math.round(c.score * 100)}%)` : ''}
                          </option>
                        ))}
                      </select>
                      {selected && best && best.unitId === selected && best.score >= 0.99 && (
                        <span className="text-[10px] font-semibold text-primary-500 uppercase">exact</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
