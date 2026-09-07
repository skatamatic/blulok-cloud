/**
 * BluDesign Layout Import — Hover detail card
 *
 * A portal-rendered card that floats next to the cursor when hovering a detected
 * unit on the canvas, surfacing its coordinates, rotation, label and confidence.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';
import type { EditableUnit } from './types';
import {
  confidenceTextClass,
  formatPct,
  unitAccentColor,
  isUnlabeledRectangle,
} from './colors';
import { radToDeg } from './geometry';

interface UnitHoverCardProps {
  unit: EditableUnit;
  /** Cursor position in viewport (client) coordinates. */
  x: number;
  y: number;
}

export const UnitHoverCard: React.FC<UnitHoverCardProps> = ({ unit, x, y }) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const CARD_W = 240;
  const CARD_H = 180;
  const left = x + 18 + CARD_W > window.innerWidth ? x - CARD_W - 18 : x + 18;
  const top = y + CARD_H > window.innerHeight ? window.innerHeight - CARD_H - 12 : y + 12;

  const nonUnit = isUnlabeledRectangle(unit);
  const accent = unitAccentColor(unit);
  const title = unit.label
    ? `Unit ${unit.label}`
    : nonUnit
      ? 'Rectangle · no label'
      : 'Unlabeled unit';

  const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{label}</span>
      <span className={`font-medium tabular-nums ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
        {children}
      </span>
    </div>
  );

  return createPortal(
    <div
      style={{ left, top, width: CARD_W }}
      className={`
        fixed z-[100] pointer-events-none rounded-xl border shadow-soft-lg overflow-hidden
        ${isDark ? 'bg-gray-900/95 border-gray-700' : 'bg-white/95 border-gray-200'}
        backdrop-blur-sm
      `}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ backgroundColor: `${accent}1a` }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
          <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {title}
          </span>
        </div>
        {unit.colorHex && (
          <span
            className="w-4 h-4 rounded border border-black/10"
            style={{ backgroundColor: unit.colorHex }}
            title={unit.colorHex}
          />
        )}
      </div>

      <div className="px-3 py-2.5 space-y-1.5">
        <Row label="Center">
          {Math.round(unit.bounds.cx)}, {Math.round(unit.bounds.cy)} px
        </Row>
        <Row label="Size">
          {Math.round(unit.bounds.width)} × {Math.round(unit.bounds.height)} px
        </Row>
        <Row label="Rotation">{radToDeg(unit.rotationRad).toFixed(1)}°</Row>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Detection</span>
          <span className={`font-medium tabular-nums ${confidenceTextClass(unit.detectionConfidence)}`}>
            {formatPct(unit.detectionConfidence)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Label OCR</span>
          <span
            className={`font-medium tabular-nums ${
              unit.label
                ? confidenceTextClass(unit.labelConfidence)
                : isDark
                  ? 'text-gray-500'
                  : 'text-gray-400'
            }`}
          >
            {unit.label ? formatPct(unit.labelConfidence) : '—'}
          </span>
        </div>
        {(unit.edited || unit.manual) && (
          <div className="pt-1 flex gap-1.5">
            {unit.manual && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-500/15 text-primary-500">
                Added manually
              </span>
            )}
            {unit.edited && !unit.manual && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-500">
                Adjusted
              </span>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
