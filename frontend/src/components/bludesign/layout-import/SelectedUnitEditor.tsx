/**
 * BluDesign Layout Import — Selected unit editor
 *
 * Inline editor for the currently selected detected unit: label, rotation, and
 * removal. Label changes apply live as you type.
 */

import React, { useEffect, useRef, useState } from 'react';
import { TrashIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import type { DoorSide, EditableUnit, UnitDoor } from './types';
import { DEFAULT_DOOR_WIDTH_FRACTION } from './types';
import { degToRad, normalizeRotation, radToDeg } from './geometry';
import { confidenceTextClass, formatPct, DOOR_COLOR } from './colors';

interface SelectedUnitEditorProps {
  unit: EditableUnit;
  /** True when this unit is flagged as a problem (no label / duplicate). */
  isError?: boolean;
  /** `inline` nests under a list row; `card` is the standalone panel style. */
  variant?: 'card' | 'inline';
  /** Focus and select the unit-number field when this unit is shown. */
  autoFocusLabel?: boolean;
  onLabelChangeLive: (id: string, label: string) => void;
  onLabelEditEnd: (id: string) => void;
  onPatch: (id: string, patch: Partial<EditableUnit>) => void;
  onDoorChange: (id: string, patch: Partial<UnitDoor>) => void;
  onDoorLive: (id: string, patch: Partial<UnitDoor>) => void;
  onDoorEditEnd: (id: string) => void;
  onDelete: (id: string) => void;
  /** Enter in the unit-number field — advance to the next problem. */
  onLabelEnter?: () => void;
  onLabelArrowUp?: () => void;
  onLabelArrowDown?: () => void;
}

const DOOR_SIDE_OPTIONS: { side: DoorSide; label: string }[] = [
  { side: 'top', label: 'Top' },
  { side: 'bottom', label: 'Bottom' },
  { side: 'left', label: 'Left' },
  { side: 'right', label: 'Right' },
];

export const SelectedUnitEditor: React.FC<SelectedUnitEditorProps> = ({
  unit,
  isError,
  variant = 'card',
  autoFocusLabel = false,
  onLabelChangeLive,
  onLabelEditEnd,
  onPatch,
  onDoorChange,
  onDoorLive,
  onDoorEditEnd,
  onDelete,
  onLabelEnter,
  onLabelArrowUp,
  onLabelArrowDown,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const inline = variant === 'inline';

  const [labelDraft, setLabelDraft] = useState(unit.label ?? '');
  const [rotationDraft, setRotationDraft] = useState(radToDeg(unit.rotationRad).toFixed(1));
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabelDraft(unit.label ?? '');
    setRotationDraft(radToDeg(unit.rotationRad).toFixed(1));
  }, [unit.id, unit.label, unit.rotationRad]);

  useEffect(() => {
    if (!autoFocusLabel) return;
    const input = labelInputRef.current;
    if (!input) return;
    const id = window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [unit.id, autoFocusLabel]);

  const inputClass = `
    w-full px-2.5 py-1.5 rounded-lg border text-sm transition-colors
    focus:outline-none focus:ring-2 focus:ring-primary-500
    ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}
  `;
  const labelClass = `block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`;

  const commitRotation = () => {
    const deg = parseFloat(rotationDraft);
    if (!Number.isNaN(deg)) {
      onPatch(unit.id, { rotationRad: normalizeRotation(degToRad(deg)) });
    }
  };

  const door = unit.door;
  const doorWidthPct = Math.round((door?.widthFraction ?? DEFAULT_DOOR_WIDTH_FRACTION) * 100);
  const doorOffsetPct = Math.round((door?.offsetFraction ?? 0) * 100);

  return (
    <div
      className={
        inline
          ? `px-2.5 pb-2.5 pt-1 border-t ${
              isError
                ? isDark
                  ? 'border-error-500/30 bg-error-500/5'
                  : 'border-error-200 bg-error-50/40'
                : isDark
                  ? 'border-gray-700/80 bg-gray-800/40'
                  : 'border-gray-200 bg-gray-50/80'
            }`
          : `rounded-xl border p-3 ${
              isError
                ? isDark
                  ? 'bg-error-500/5 border-error-500/40'
                  : 'bg-error-50/60 border-error-300'
                : isDark
                  ? 'bg-gray-800/60 border-gray-700'
                  : 'bg-white border-gray-200 shadow-sm'
            }`
      }
    >
      {!inline && (
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Selected unit
          </h3>
          <span className={`text-xs tabular-nums ${confidenceTextClass(unit.detectionConfidence)}`}>
            {formatPct(unit.detectionConfidence)} match
          </span>
        </div>
      )}

      {isError && (
        <div
          className={`flex items-center gap-1.5 mb-2.5 px-2 py-1.5 rounded-lg text-xs font-medium ${
            isDark ? 'bg-error-500/10 text-error-300' : 'bg-error-100 text-error-700'
          }`}
        >
          <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
          {unit.label ? 'Duplicate unit number' : 'No unit number — add a label or delete'}
        </div>
      )}

      <div className="mb-2.5">
        <label className={labelClass} htmlFor={`unit-label-${unit.id}`}>
          Unit number
        </label>
        <input
          id={`unit-label-${unit.id}`}
          ref={labelInputRef}
          data-layout-import-unit-label="true"
          value={labelDraft}
          onChange={(e) => {
            setLabelDraft(e.target.value);
            onLabelChangeLive(unit.id, e.target.value);
          }}
          onBlur={() => onLabelEditEnd(unit.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onLabelEditEnd(unit.id);
              onLabelEnter?.();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              onLabelEditEnd(unit.id);
              onLabelArrowUp?.();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              onLabelEditEnd(unit.id);
              onLabelArrowDown?.();
            }
          }}
          placeholder="e.g. 142"
          className={inputClass}
        />
      </div>

      <div className="mb-3">
        <label className={labelClass}>Rotation°</label>
        <input
          type="number"
          value={rotationDraft}
          onChange={(e) => setRotationDraft(e.target.value)}
          onBlur={commitRotation}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          step="1"
          className={inputClass}
        />
      </div>

      {/* Door */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className={labelClass} style={{ marginBottom: 0 }}>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: DOOR_COLOR }}
              />
              Door side
            </span>
          </label>
          {door && !door.auto && (
            <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              manual
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 mb-2">
          {DOOR_SIDE_OPTIONS.map((opt) => {
            const active = door?.side === opt.side;
            return (
              <button
                key={opt.side}
                type="button"
                onClick={() => onDoorChange(unit.id, { side: opt.side })}
                className={`px-1.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-white'
                    : isDark
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={active ? { backgroundColor: DOOR_COLOR } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {door && (
          <div className="space-y-2">
            <div>
              <div className={`flex items-center justify-between text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <span>Width</span>
                <span className="tabular-nums">{doorWidthPct}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={1}
                value={doorWidthPct}
                onChange={(e) => onDoorLive(unit.id, { widthFraction: Number(e.target.value) / 100 })}
                onPointerUp={() => onDoorEditEnd(unit.id)}
                onBlur={() => onDoorEditEnd(unit.id)}
                className="w-full accent-amber-500"
              />
            </div>
            <div>
              <div className={`flex items-center justify-between text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <span>Offset</span>
                <span className="tabular-nums">{doorOffsetPct > 0 ? `+${doorOffsetPct}` : doorOffsetPct}%</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={doorOffsetPct}
                onChange={(e) => onDoorLive(unit.id, { offsetFraction: Number(e.target.value) / 100 })}
                onPointerUp={() => onDoorEditEnd(unit.id)}
                onBlur={() => onDoorEditEnd(unit.id)}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      <div
        className={`grid grid-cols-2 gap-x-3 gap-y-1 mb-3 text-xs ${
          isDark ? 'text-gray-400' : 'text-gray-500'
        }`}
      >
        <span>Center</span>
        <span className="text-right tabular-nums">
          {Math.round(unit.bounds.cx)}, {Math.round(unit.bounds.cy)}
        </span>
        <span>Size</span>
        <span className="text-right tabular-nums">
          {Math.round(unit.bounds.width)} × {Math.round(unit.bounds.height)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onDelete(unit.id)}
        className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-error-500 hover:bg-error-500/10 transition-colors"
      >
        <TrashIcon className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>
  );
};
