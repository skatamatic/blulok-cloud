/**
 * BluDesign Import Page
 *
 * Import a facility plan (PNG/JPG/WEBP/PDF) and run a best-effort first pass that
 * detects storage units, their positions, rotations and labels. The result is an
 * interactive, human-in-the-loop review canvas where each detected unit can be
 * inspected, adjusted, confirmed or rejected before importing into the editor.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SparklesIcon,
  ExclamationCircleIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { useLayoutImport } from '@/components/bludesign/layout-import/useLayoutImport';
import { UploadDropzone } from '@/components/bludesign/layout-import/UploadDropzone';
import { Toolbar } from '@/components/bludesign/layout-import/Toolbar';
import {
  LayoutCanvas,
  type LayoutCanvasHandle,
} from '@/components/bludesign/layout-import/LayoutCanvas';
import { DetectionSidebar } from '@/components/bludesign/layout-import/DetectionSidebar';
import { DetectionProgressOverlay } from '@/components/bludesign/layout-import/DetectionProgressOverlay';
import { ProblemsOverlay } from '@/components/bludesign/layout-import/ProblemsOverlay';
import { BuildWizard } from '@/components/bludesign/layout-import/build-wizard/BuildWizard';
import { PdfPagePicker } from '@/components/bludesign/layout-import/PdfPagePicker';

const BluDesignImportPage: React.FC = () => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const c = useLayoutImport();
  const canvasRef = useRef<LayoutCanvasHandle>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const [showWizard, setShowWizard] = useState(false);

  const hasSource = !!c.source && (c.status === 'ready' || c.status === 'processing');
  const isImportBusy =
    c.status === 'loading' || c.status === 'processing' || !!c.progress;
  const progressOverlay =
    c.progress ??
    (c.status === 'loading'
      ? { stage: 'finding' as const, total: 0, done: 0, detail: 'Reading file…' }
      : null);

  const focusUnit = useCallback(
    (id: string) => {
      const unit = c.units.find((u) => u.id === id);
      if (unit) canvasRef.current?.focusUnit(unit);
    },
    [c.units]
  );

  const handleLoadFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void c.importProject(file);
      e.target.value = '';
    },
    [c]
  );

  // Tool + history keyboard shortcuts (canvas owns delete/nudge).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) c.redo();
        else c.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        c.redo();
        return;
      }
      if (!hasSource || isImportBusy) return;
      if (e.key === 'v' || e.key === 'V') c.setTool('select');
      else if (e.key === 'a' || e.key === 'A') c.setTool('add');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c, hasSource, isImportBusy]);

  const handleAddUnit = useCallback(
    (unit: Parameters<typeof c.addUnit>[0]) => {
      c.addUnit(unit);
      c.setTool('select');
    },
    [c]
  );

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div className={`flex flex-col h-full ${isDark ? 'bg-gray-950' : 'bg-gray-50'}`}>
        {/* Page header */}
        <div
          className={`flex items-center gap-3 px-5 py-3 border-b flex-shrink-0 ${
            isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
          }`}
        >
          <div className={`p-2 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-primary-50'}`}>
            <SparklesIcon className="w-5 h-5 text-primary-500" />
          </div>
          <div className="min-w-0">
            <h1 className={`text-lg font-bold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Import from plan
            </h1>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Detect storage units from an image or PDF, then review &amp; refine.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 relative">
          {!hasSource ? (
            <div
              className={`absolute inset-0 flex items-center justify-center p-6 overflow-auto ${
                isImportBusy ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <div className="w-full">
                <UploadDropzone onFile={c.onUpload} disabled={isImportBusy} />
                <div className="max-w-2xl mx-auto mt-4 flex items-center justify-center">
                  <button
                    type="button"
                    disabled={isImportBusy}
                    onClick={() => loadInputRef.current?.click()}
                    className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                      isDark
                        ? 'text-gray-300 hover:bg-gray-800'
                        : 'text-gray-600 hover:bg-gray-100'
                    } ${isImportBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <FolderOpenIcon className="w-4 h-4" />
                    Load a saved layout (.json)
                  </button>
                  <input
                    ref={loadInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleLoadFile}
                    className="hidden"
                  />
                </div>

                <AnimatePresence>
                  {c.error && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="max-w-2xl mx-auto mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-error-500/10 text-error-500 text-sm"
                    >
                      <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />
                      <span>{c.error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div
              className={`flex flex-col xl:flex-row h-full ${
                isImportBusy ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {/* Canvas column */}
              <div className="flex-1 min-w-0 flex flex-col min-h-[50vh] xl:min-h-0">
                <Toolbar
                  tool={c.tool}
                  onToolChange={c.setTool}
                  showLabels={c.showLabels}
                  onToggleLabels={() => c.setShowLabels(!c.showLabels)}
                  showImage={c.showImage}
                  onToggleImage={() => c.setShowImage(!c.showImage)}
                  canUndo={c.canUndo}
                  canRedo={c.canRedo}
                  onUndo={c.undo}
                  onRedo={c.redo}
                  disabled={isImportBusy}
                />
                <div className="flex-1 min-h-0 relative">
                  {c.source && (
                    <LayoutCanvas
                      ref={canvasRef}
                      source={c.source}
                      units={c.units}
                      selectedIds={c.selectedIds}
                      hoveredId={c.hoveredId}
                      tool={c.tool}
                      showLabels={c.showLabels}
                      showImage={c.showImage}
                      errorIds={c.errorIds}
                      showNonUnits={c.showNonUnits}
                      showDoors={c.showDoors}
                      onSelect={c.setSelectedId}
                      onSelectMany={c.setSelection}
                      onToggleSelect={c.toggleSelectedId}
                      onAddToSelection={c.addToSelection}
                      onSnapshot={c.snapshot}
                      onUpdateLive={c.updateUnitLive}
                      onUpdateManyLive={c.updateManyLive}
                      onAddUnit={handleAddUnit}
                      onDeleteSelected={c.removeSelected}
                    />
                  )}

                  {c.status === 'ready' && (
                    <ProblemsOverlay
                      errors={c.errors}
                      units={c.units}
                      selectedIds={c.selectedIds}
                      onSelect={(id) => {
                        c.setSelectedId(id);
                        focusUnit(id);
                      }}
                      onHover={c.setHoveredId}
                      onDelete={c.removeUnit}
                    />
                  )}

                  {/* Empty-result guidance */}
                  {c.status === 'ready' && c.units.length === 0 && (
                    <div className="absolute inset-x-0 top-6 flex justify-center pointer-events-none">
                      <div
                        className={`pointer-events-auto max-w-sm text-center px-5 py-4 rounded-xl shadow-soft-lg ${
                          isDark ? 'bg-gray-900 text-gray-200' : 'bg-white text-gray-700'
                        }`}
                      >
                        <p className="text-sm font-semibold mb-1">No rectangles detected</p>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Try raising <span className="font-medium">edge gap tolerance</span> or
                          <span className="font-medium"> detail</span> in Detection settings,
                          then re-run. You can also draw units manually with the Add tool.
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Sidebar — stacks below canvas on narrow viewports */}
              <div className="w-full xl:w-[340px] flex-shrink-0 h-full max-h-[45vh] xl:max-h-full border-t xl:border-t-0">
                <DetectionSidebar
                  controller={c}
                  onReupload={c.reset}
                  onFocusUnit={focusUnit}
                  onImport={() => setShowWizard(true)}
                  disabled={isImportBusy}
                />
              </div>
            </div>
          )}

          <AnimatePresence>
            {progressOverlay && isImportBusy && (
              <DetectionProgressOverlay
                progress={progressOverlay}
                isDark={isDark}
                onCancel={c.cancelDetection}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {c.pendingPdf && (
          <PdfPagePicker
            fileName={c.pendingPdf.file.name}
            pageCount={c.pendingPdf.pageCount}
            onConfirm={(page) => void c.confirmPdfPage(page)}
            onCancel={c.cancelPendingPdf}
          />
        )}
        {showWizard && (
          <BuildWizard
            units={c.units}
            source={c.source}
            defaultSceneName={c.fileName.replace(/\.[^.]+$/, '') || undefined}
            onClose={() => setShowWizard(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default BluDesignImportPage;
