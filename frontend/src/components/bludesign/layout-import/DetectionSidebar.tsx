/**
 * BluDesign Layout Import — Review sidebar
 *
 * The right-hand control surface for the review workflow: source summary, live
 * stats, bulk actions, a bounded scrollable unit list (with inline expand
 * editor per single selection), display controls, and detection settings.
 */

import React, { useRef } from 'react';
import {
  DocumentIcon,
  ArrowUpTrayIcon,
  Squares2X2Icon,
  ArrowDownTrayIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import type { LayoutImportController } from './useLayoutImport';
import { UnitList } from './UnitList';
import { DetectionOptionsPanel } from './DetectionOptionsPanel';

interface DetectionSidebarProps {
  controller: LayoutImportController;
  onReupload: () => void;
  /** Select + animate the canvas to a unit (wired to the canvas handle). */
  onFocusUnit?: (id: string) => void;
  onImport?: () => void;
  disabled?: boolean;
}

export const DetectionSidebar: React.FC<DetectionSidebarProps> = ({
  controller,
  onReupload,
  onFocusUnit,
  onImport,
  disabled = false,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const loadInputRef = useRef<HTMLInputElement>(null);

  const {
    source,
    fileName,
    stats,
    units,
    notice,
    errorIds,
    selectedId,
    selectedIds,
    setSelectedId,
    setHoveredId,
    options,
    setOptions,
    reprocess,
    status,
    setUnitLabelLive,
    finishLabelEdit,
    setUnitDoor,
    setUnitDoorLive,
    finishDoorEdit,
    updateUnit,
    removeUnit,
    exportProject,
    importProject,
    errors,
    selectNextProblemUnit,
    showNotice,
  } = controller;

  const handleSelectFocus = (id: string) => {
    setSelectedId(id);
    onFocusUnit?.(id);
  };

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void importProject(file);
    e.target.value = '';
  };

  const sectionTitle = `text-xs font-semibold uppercase tracking-wide ${
    isDark ? 'text-gray-500' : 'text-gray-400'
  }`;

  const StatPill: React.FC<{ value: number; label: string; color?: string }> = ({
    value,
    label,
    color,
  }) => (
    <div
      className={`flex flex-col items-center justify-center py-2 rounded-lg ${
        isDark ? 'bg-gray-800/60' : 'bg-gray-50'
      }`}
    >
      <span
        className="text-lg font-bold tabular-nums leading-none"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
      <span className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  );

  return (
    <div
      data-layout-import-sidebar
      className={`flex flex-col h-full border-l ${
        isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      }`}
    >
      {/* Source header */}
      <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ${
              isDark ? 'bg-gray-800 text-primary-400' : 'bg-primary-50 text-primary-500'
            }`}
          >
            <DocumentIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {fileName || 'Untitled plan'}
            </p>
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {source ? `${source.width} × ${source.height}px` : ''}
              {source?.rasterizedFromPdf ? ' · from PDF' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onReupload}
            title="Upload a different file"
            aria-label="Upload a different file"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              isDark ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Save / Load (skip the OCR next time) */}
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <button
            type="button"
            onClick={() => void exportProject()}
            title="Save this layout (image + boxes) to a file"
            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isDark ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => loadInputRef.current?.click()}
            title="Load a saved layout file"
            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isDark ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FolderOpenIcon className="w-4 h-4" />
            Load
          </button>
          <input
            ref={loadInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleLoadFile}
            className="hidden"
          />
        </div>
      </div>

      {/* Body: summary · bounded unit list · settings */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className={`flex-shrink-0 px-4 py-3 space-y-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          {notice && (
            <div
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                notice.type === 'error'
                  ? 'bg-error-500/10 text-error-500'
                  : notice.type === 'success'
                    ? 'bg-success-500/10 text-success-600'
                    : isDark
                      ? 'bg-gray-800 text-gray-300'
                      : 'bg-gray-100 text-gray-600'
              }`}
            >
              {notice.text}
            </div>
          )}

          <div>
            <div className="grid grid-cols-3 gap-2">
              <StatPill value={stats.unitCount} label="Units" color="#147FD4" />
              <StatPill value={stats.withLabel} label="Labeled" color="#147FD4" />
              <StatPill value={stats.rectCount} label="Unlabeled" color="#9ca3af" />
            </div>
            {stats.edited > 0 && (
              <p className={`mt-2 px-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {stats.edited} adjusted · {stats.manual} added manually
              </p>
            )}
          </div>
        </div>

        {/* Bounded, scrollable unit list with inline expand editor */}
        <div className="flex-1 min-h-0 flex flex-col px-4 py-3">
          <h3 className={`${sectionTitle} mb-2 flex-shrink-0`}>Detected units</h3>
          <UnitList
            units={units}
            selectedId={selectedId}
            selectedIds={selectedIds}
            errorIds={errorIds}
            onSelect={handleSelectFocus}
            onHover={setHoveredId}
            onLabelChangeLive={setUnitLabelLive}
            onLabelEditEnd={finishLabelEdit}
            onPatch={updateUnit}
            onDoorChange={setUnitDoor}
            onDoorLive={setUnitDoorLive}
            onDoorEditEnd={finishDoorEdit}
            onDelete={removeUnit}
            onSelectNextProblem={selectNextProblemUnit}
            onAllProblemsFixed={() =>
              showNotice({ type: 'success', text: 'All problems resolved — ready to build.' })
            }
          />
        </div>

        <div
          className={`flex-shrink-0 overflow-y-auto px-4 py-3 border-t max-h-[42%] ${
            isDark ? 'border-gray-800' : 'border-gray-100'
          }`}
        >
          <DetectionOptionsPanel
            options={options}
            onChange={setOptions}
            onReprocess={reprocess}
            processing={status === 'processing'}
          />
        </div>
      </div>

      {/* Footer: import action */}
      {onImport && (
        <div className={`px-4 py-3 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
          <button
            type="button"
            onClick={onImport}
            disabled={stats.withLabel === 0 || errors.length > 0}
            className={`
              w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold
              transition-all duration-150 bg-primary-600 text-white
              disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700
            `}
          >
            <Squares2X2Icon className="w-4 h-4" />
            Import {stats.withLabel} unit{stats.withLabel === 1 ? '' : 's'} to editor
          </button>
          <p className={`text-[10px] text-center mt-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {errors.length > 0
              ? 'Fix problems before importing.'
              : 'Only labeled units are imported.'}
          </p>
        </div>
      )}
    </div>
  );
};
