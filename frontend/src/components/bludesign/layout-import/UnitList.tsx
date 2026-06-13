/**
 * BluDesign Layout Import — Detected unit list
 *
 * A filterable, bounded, scrollable list of detected units. Selecting a row
 * expands an inline editor beneath it (label, delete). Selection/hover mirrors
 * the canvas so the two views stay in sync.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';
import type { EditableUnit, UnitDoor } from './types';
import {
  unitAccentColor,
  confidenceTextClass,
  formatPct,
  isUnlabeledRectangle,
  ERROR_COLOR,
} from './colors';
import { SelectedUnitEditor } from './SelectedUnitEditor';
import { scrollRowFullyVisible } from './unitListScroll';
import { compareUnitsByLabel } from './unitLabelSort';

type ListFilter = 'all' | 'labeled' | 'unlabeled';

interface UnitListProps {
  units: EditableUnit[];
  selectedId: string | null;
  selectedIds: Set<string>;
  errorIds: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onLabelChangeLive: (id: string, label: string) => void;
  onLabelEditEnd: (id: string) => void;
  onPatch: (id: string, patch: Partial<EditableUnit>) => void;
  onDoorChange: (id: string, patch: Partial<UnitDoor>) => void;
  onDoorLive: (id: string, patch: Partial<UnitDoor>) => void;
  onDoorEditEnd: (id: string) => void;
  onDelete: (id: string) => void;
  onSelectNextProblem?: (currentId: string) => string | null;
  onAllProblemsFixed?: () => void;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const input = target as HTMLInputElement;
  if (input.type === 'range' || input.type === 'checkbox' || input.type === 'radio') return false;
  return true;
}

const FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'labeled', label: 'Labeled' },
  { id: 'unlabeled', label: 'Unlabeled' },
];

export const UnitList: React.FC<UnitListProps> = ({
  units,
  selectedId,
  selectedIds,
  errorIds,
  onSelect,
  onHover,
  onLabelChangeLive,
  onLabelEditEnd,
  onPatch,
  onDoorChange,
  onDoorLive,
  onDoorEditEnd,
  onDelete,
  onSelectNextProblem,
  onAllProblemsFixed,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [filter, setFilter] = useState<ListFilter>('all');
  const [query, setQuery] = useState('');
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const listScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedUnit = useMemo(
    () => (selectedId ? units.find((u) => u.id === selectedId) ?? null : null),
    [units, selectedId]
  );

  const unitIndexById = useMemo(() => {
    const map = new Map<string, number>();
    units.forEach((u, i) => map.set(u.id, i + 1));
    return map;
  }, [units]);

  const originalOrderById = useMemo(() => {
    const map = new Map<string, number>();
    units.forEach((u, i) => map.set(u.id, i));
    return map;
  }, [units]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = units.filter((u) => {
      const labeled = !!u.label;
      if (filter === 'labeled' && !labeled) return false;
      if (filter === 'unlabeled' && labeled) return false;
      if (q && !(u.label ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => compareUnitsByLabel(a, b, originalOrderById));
  }, [units, filter, query, originalOrderById]);

  useEffect(() => {
    if (!selectedId) return;
    if (filtered.some((u) => u.id === selectedId)) return;
  }, [filtered, selectedId]);

  const selectionHidden = selectedId && !filtered.some((u) => u.id === selectedId);

  const scrollSelectedIntoView = useCallback(() => {
    if (!selectedId) return;
    const row = rowRefs.current[selectedId];
    const container = listScrollRef.current;
    if (!row || !container) return;
    scrollRowFullyVisible(row, container);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    scrollSelectedIntoView();
    const t = window.setTimeout(scrollSelectedIntoView, 220);
    return () => window.clearTimeout(t);
  }, [selectedId, scrollSelectedIntoView]);

  const navigateList = useCallback(
    (direction: 'prev' | 'next') => {
      if (filtered.length === 0) return;
      const idx = selectedId ? filtered.findIndex((u) => u.id === selectedId) : -1;
      let nextIdx: number;
      if (direction === 'next') {
        nextIdx = idx < filtered.length - 1 ? idx + 1 : 0;
      } else {
        nextIdx = idx > 0 ? idx - 1 : filtered.length - 1;
      }
      onSelect(filtered[nextIdx].id);
    },
    [filtered, selectedId, onSelect]
  );

  const handleLabelEnter = useCallback(() => {
    if (!selectedId || !onSelectNextProblem) return;
    const nextId = onSelectNextProblem(selectedId);
    if (nextId) {
      onSelect(nextId);
    } else {
      onAllProblemsFixed?.();
    }
  }, [selectedId, onSelectNextProblem, onSelect, onAllProblemsFixed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const target = e.target as HTMLElement;
      if (!target.closest('[data-layout-import-sidebar]')) return;
      if (target.dataset.layoutImportUnitLabel === 'true') return;
      if (target instanceof HTMLInputElement && target.type === 'range') return;
      if (isTextEntryTarget(target) && target !== searchInputRef.current) return;
      e.preventDefault();
      navigateList(e.key === 'ArrowDown' ? 'next' : 'prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigateList]);

  const filterCount = (id: ListFilter) => {
    if (id === 'all') return units.length;
    if (id === 'labeled') return units.filter((u) => u.label).length;
    return units.filter((u) => !u.label).length;
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {selectionHidden && (
        <p className={`flex-shrink-0 mb-2 text-[11px] ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
          Selected unit is hidden by the current filter. Clear search or change filter to see it.
        </p>
      )}
      <div className="flex-shrink-0 flex items-center gap-1 mb-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = filterCount(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`
                flex-1 px-1.5 py-1 rounded-lg text-[11px] font-medium transition-colors
                ${active
                  ? 'bg-primary-500 text-white'
                  : isDark
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }
              `}
            >
              {f.label} {count > 0 && <span className="opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      <input
        ref={searchInputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search labels…"
        className={`
          flex-shrink-0 w-full px-2.5 py-1.5 mb-2 rounded-lg border text-sm transition-colors
          focus:outline-none focus:ring-2 focus:ring-primary-500
          ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}
        `}
      />

      <div
        ref={listScrollRef}
        className={`flex-1 min-h-0 overflow-y-auto rounded-lg border p-1 space-y-1 ${
          isDark ? 'border-gray-800 bg-gray-950/30' : 'border-gray-200 bg-gray-50/50'
        }`}
      >
        {filtered.length === 0 ? (
          <p className={`text-center text-xs py-6 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            No units match.
          </p>
        ) : (
          filtered.map((u) => {
            const displayIndex = unitIndexById.get(u.id) ?? 0;
            const isSel = selectedIds.has(u.id);
            const showEditor = isSel && selectedIds.size === 1;
            const nonUnit = isUnlabeledRectangle(u);
            const hasError = errorIds.has(u.id);
            const dotColor = hasError ? ERROR_COLOR : unitAccentColor(u);
            return (
              <div
                key={u.id}
                ref={(el) => {
                  rowRefs.current[u.id] = el;
                }}
                className={`rounded-lg overflow-hidden ${
                  isSel
                    ? isDark
                      ? 'ring-1 ring-primary-500/60'
                      : 'ring-1 ring-primary-500/40'
                    : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(u.id)}
                  onMouseEnter={() => onHover(u.id)}
                  onMouseLeave={() => onHover(null)}
                  className={`
                    w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left
                    transition-colors
                    ${isSel
                      ? isDark
                        ? 'bg-primary-500/15'
                        : 'bg-primary-500/10'
                      : isDark
                        ? 'hover:bg-gray-800/80'
                        : 'hover:bg-white'
                    }
                  `}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span
                    className={`text-sm font-medium flex-1 truncate ${
                      nonUnit
                        ? isDark
                          ? 'text-gray-400'
                          : 'text-gray-500'
                        : isDark
                          ? 'text-gray-100'
                          : 'text-gray-900'
                    }`}
                  >
                    {u.label ? `Unit ${u.label}` : nonUnit ? `Rectangle #${displayIndex}` : `Unit #${displayIndex}`}
                    {nonUnit && (
                      <span className={`ml-1.5 text-[10px] ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                        no label
                      </span>
                    )}
                    {u.manual && <span className="ml-1 text-[10px] text-primary-500">new</span>}
                    {u.edited && !u.manual && <span className="ml-1 text-[10px] text-amber-500">●</span>}
                  </span>
                  {u.colorHex && (
                    <span
                      className="w-3 h-3 rounded-sm border border-black/10 flex-shrink-0"
                      style={{ backgroundColor: u.colorHex }}
                    />
                  )}
                  <span className={`text-[11px] tabular-nums flex-shrink-0 ${confidenceTextClass(u.detectionConfidence)}`}>
                    {formatPct(u.detectionConfidence)}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {showEditor && selectedUnit?.id === u.id && (
                    <motion.div
                      key={`editor-${u.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <SelectedUnitEditor
                        unit={selectedUnit}
                        variant="inline"
                        isError={hasError}
                        autoFocusLabel
                        onLabelChangeLive={onLabelChangeLive}
                        onLabelEditEnd={onLabelEditEnd}
                        onPatch={onPatch}
                        onDoorChange={onDoorChange}
                        onDoorLive={onDoorLive}
                        onDoorEditEnd={onDoorEditEnd}
                        onDelete={onDelete}
                        onLabelEnter={handleLabelEnter}
                        onLabelArrowUp={() => navigateList('prev')}
                        onLabelArrowDown={() => navigateList('next')}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
