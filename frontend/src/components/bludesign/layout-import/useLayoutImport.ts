/**
 * BluDesign Layout Import — Editor state hook
 *
 * Owns the full review workflow: loading a source image/PDF, running detection,
 * and the human-in-the-loop editing of detected unit candidates (move/resize/
 * rotate/relabel/add) with undo & redo. Keeping this state in one
 * focused hook keeps the page and canvas components presentational.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectLayoutStream } from '@/api/bludesign';
import { loadSource, validateSourceFile, peekSourcePageCount, type LoadedSource } from './loadSource';
import type {
  DetectedUnitCandidate,
  DetectionOptions,
  DetectionProgress,
  EditableUnit,
  EditorTool,
  ImportPipelineStage,
  UnitDoor,
} from './types';
import { mapBackendStageToPipeline } from './types';
import { clampDoorOffset, defaultDoor } from './geometry';
import { postProcessImportedUnitsWithProgress } from './postProcess';

export type ImportStatus = 'idle' | 'loading' | 'processing' | 'ready' | 'error';

let manualIdCounter = 0;
const nextManualId = (): string => `manual-${Date.now()}-${manualIdCounter++}`;

/** Wrap a backend candidate as an editable unit. */
function toEditable(u: DetectedUnitCandidate): EditableUnit {
  return { ...u };
}

/** A detected problem the user should resolve before importing. */
export interface LayoutError {
  /** Stable id for the error row. */
  id: string;
  /** The offending unit. */
  unitId: string;
  type: 'no-label' | 'duplicate-label';
  message: string;
}

/** File-format constants for save/load. */
const PROJECT_FILE_KIND = 'bludesign-layout-import';
const PROJECT_FILE_VERSION = 1;

/** Read a File's bytes as a data URL (used to embed the plan in a saved file). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the source image.'));
    reader.readAsDataURL(file);
  });
}

/** Normalized label key for duplicate detection (trim + uppercase). */
const labelKey = (u: EditableUnit): string => (u.label ?? '').trim().toUpperCase();

/** Units eligible for import (labeled storage units). */
function isImportEligible(u: EditableUnit): boolean {
  return !!labelKey(u);
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function validateSavedUnit(raw: unknown, index: number): EditableUnit {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid unit at index ${index}.`);
  }
  const u = raw as EditableUnit;
  if (typeof u.id !== 'string' || !u.id) {
    throw new Error(`Invalid unit id at index ${index}.`);
  }
  const b = u.bounds;
  if (
    !b ||
    !isFinitePositive(b.width) ||
    !isFinitePositive(b.height) ||
    !Number.isFinite(b.cx) ||
    !Number.isFinite(b.cy)
  ) {
    throw new Error(`Invalid bounds for unit "${u.id}".`);
  }
  if (!Number.isFinite(u.rotationRad)) {
    throw new Error(`Invalid rotation for unit "${u.id}".`);
  }
  return u;
}

function validateImportProjectData(data: unknown): {
  fileName: string;
  image: { dataUrl: string; width: number; height: number; rasterizedFromPdf?: boolean };
  options: DetectionOptions;
  units: EditableUnit[];
} {
  if (!data || typeof data !== 'object') {
    throw new Error('Not a valid BluDesign layout file.');
  }
  const d = data as Record<string, unknown>;
  if (d.kind !== PROJECT_FILE_KIND) {
    throw new Error('Not a valid BluDesign layout file.');
  }
  if (d.version !== PROJECT_FILE_VERSION) {
    throw new Error('Unsupported layout file version.');
  }
  const image = d.image as Record<string, unknown> | undefined;
  if (!image || typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:')) {
    throw new Error('Layout file is missing a valid embedded image.');
  }
  if (!isFinitePositive(image.width) || !isFinitePositive(image.height)) {
    throw new Error('Layout file has invalid image dimensions.');
  }
  if (!Array.isArray(d.units)) {
    throw new Error('Layout file has an invalid units list.');
  }
  if (d.units.length > 5000) {
    throw new Error('Layout file has too many units (max 5000).');
  }
  const units = d.units.map((u, i) => validateSavedUnit(u, i));
  return {
    fileName: typeof d.fileName === 'string' ? d.fileName : 'layout.png',
    image: {
      dataUrl: image.dataUrl,
      width: image.width as number,
      height: image.height as number,
      rasterizedFromPdf: !!image.rasterizedFromPdf,
    },
    options: (d.options ?? {}) as DetectionOptions,
    units,
  };
}

export interface LayoutImportStats {
  total: number;
  edited: number;
  manual: number;
  withLabel: number;
  /** Rectangles classified as storage units (kind === 'unit'). */
  unitCount: number;
  /** Rectangles with no readable label (kind === 'rectangle'). */
  rectCount: number;
  avgDetectionConfidence: number;
}

export function useLayoutImport() {
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingPdf, setPendingPdf] = useState<{ file: File; pageCount: number } | null>(null);

  // Transient in-review notice (re-run results / non-fatal errors). Distinct from
  // `error`, which gates the initial upload screen.
  const [notice, setNotice] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(
    null
  );
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((next: NonNullable<typeof notice>) => {
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const [units, setUnitsState] = useState<EditableUnit[]>([]);
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>('select');

  const [options, setOptions] = useState<DetectionOptions>({});
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Live streaming progress (null when not detecting).
  const [progress, setProgress] = useState<DetectionProgress | null>(null);
  // Aborts an in-flight detection stream (on reset/new upload/unmount).
  const abortRef = useRef<AbortController | null>(null);
  /** Bumped on cancel/reset so in-flight load/detect work cannot repopulate state. */
  const activeImportRunRef = useRef(0);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  // Revoke the source preview/object URL when it changes or on unmount.
  useEffect(
    () => () => {
      if (source?.previewUrl) URL.revokeObjectURL(source.previewUrl);
    },
    [source]
  );

  // Display preferences.
  const [showLabels, setShowLabels] = useState(true);
  // Show the original plan underneath the overlay. Toggle off to review the
  // computed boxes/labels alone on a clean backdrop.
  const [showImage, setShowImage] = useState(true);
  // Show rectangles with no readable label ("likely not a unit"). Kept visible
  // by default so nothing is silently hidden; toggle off to declutter.
  const [showNonUnits, setShowNonUnits] = useState(true);
  // Show the per-unit door markers.
  const [showDoors, setShowDoors] = useState(true);

  // Undo / redo stacks of unit snapshots.
  const undoStack = useRef<EditableUnit[][]>([]);
  const redoStack = useRef<EditableUnit[][]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  /** Label fields that already captured an undo snapshot for the current edit. */
  const labelEditSnapshotted = useRef(new Set<string>());
  /** Door sliders that already captured an undo snapshot for the current drag. */
  const doorEditSnapshotted = useRef(new Set<string>());

  const bumpHistory = useCallback(() => setHistoryVersion((v) => v + 1), []);

  /** Snapshot current units onto the undo stack before a mutation. */
  const snapshot = useCallback(() => {
    undoStack.current.push(units);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    bumpHistory();
  }, [units, bumpHistory]);

  const setUnits = useCallback(
    (updater: (prev: EditableUnit[]) => EditableUnit[]) => {
      setUnitsState((prev) => updater(prev));
    },
    []
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setUnitsState((current) => {
      redoStack.current.push(current);
      return prev;
    });
    bumpHistory();
  }, [bumpHistory]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setUnitsState((current) => {
      undoStack.current.push(current);
      return next;
    });
    bumpHistory();
  }, [bumpHistory]);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  // historyVersion is referenced so canUndo/canRedo recompute on change.
  void historyVersion;

  const resetHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    bumpHistory();
  }, [bumpHistory]);

  /**
   * Run detection against a loaded source.
   *
   * On the initial run a failure surfaces as a fatal `error` (the upload screen
   * shows it). On a re-run (`isReprocess`) a failure is non-fatal: the existing
   * review is preserved and the problem is reported via a transient notice, so a
   * bad parameter sweep never discards the user's confirmations/edits.
   */
  const runDetection = useCallback(
    async (loaded: LoadedSource, isReprocess: boolean) => {
      const runId = activeImportRunRef.current;
      setStatus('processing');
      setError(null);
      const prevCount = unitsRef.current.length;

      // Cancel any prior in-flight stream and start a fresh one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Buffer candidates discovered this run so we can map id → unit cheaply as
      // per-unit OCR resolves, and apply incremental updates to React state.
      setProgress({ stage: 'finding', total: 0, done: 0 });
      // On a re-run, keep the existing boxes on screen until the new
      // 'rectangles' event replaces them, avoiding a flash to empty.
      if (!isReprocess) {
        setUnitsState([]);
        setSelectedIds(new Set());
      }

      try {
        const result = await detectLayoutStream(
          loaded.uploadFile,
          optionsRef.current,
          (event) => {
            if (runId !== activeImportRunRef.current) return;
            switch (event.type) {
              case 'stage':
                setProgress((p) => {
                  const pipelineStage = mapBackendStageToPipeline(event.stage);
                  if (event.stage === 'reading') {
                    return {
                      stage: 'reading',
                      total: p?.total ?? 0,
                      done: 0,
                    };
                  }
                  if (event.stage === 'finalizing') {
                    return { stage: 'filtering', total: 0, done: 0 };
                  }
                  if (event.stage === 'detecting' || event.stage === 'decoding') {
                    return { stage: 'finding', total: 0, done: 0 };
                  }
                  return {
                    stage: pipelineStage,
                    total: p?.total ?? 0,
                    done: p?.done ?? 0,
                    detail: p?.detail,
                  };
                });
                break;
              case 'rectangles':
                setUnitsState(event.units.map(toEditable));
                setSelectedIds(new Set());
                setProgress({
                  stage: 'reading',
                  total: event.total,
                  done: 0,
                });
                break;
              case 'unit':
                setUnitsState((prev) =>
                  prev.map((u) =>
                    u.id === event.unit.id && !u.edited ? { ...u, ...event.unit } : u
                  )
                );
                break;
              case 'progress':
                setProgress((p) => {
                  const pipelineStage =
                    p?.stage === 'reading' ? 'reading' : 'finding';
                  return {
                    stage: pipelineStage,
                    total: event.total,
                    done: event.done,
                  };
                });
                break;
              default:
                break;
            }
          },
          controller.signal
        );

        if (runId !== activeImportRunRef.current) return;

        setWarnings(result.warnings ?? []);
        const editable = result.units.map(toEditable);
        const processed = await postProcessImportedUnitsWithProgress(
          editable,
          result.imageWidth,
          result.imageHeight,
          (stage: ImportPipelineStage) => {
            if (runId !== activeImportRunRef.current) return;
            setProgress({ stage, total: 0, done: 0 });
          }
        );
        if (runId !== activeImportRunRef.current) return;
        setUnitsState(processed);
        resetHistory();
        setStatus('ready');
        setProgress(null);
        if (isReprocess) {
          const delta = result.units.length - prevCount;
          const sign = delta > 0 ? `+${delta}` : `${delta}`;
          const unitCount = result.units.filter((u) => u.kind === 'unit').length;
          showNotice({
            type: 'success',
            text: `Found ${result.units.length} rectangle${
              result.units.length === 1 ? '' : 's'
            } (${unitCount} labeled)${delta !== 0 ? ` · ${sign}` : ''}.`,
          });
        }
      } catch (e) {
        setProgress(null);
        if (controller.signal.aborted || runId !== activeImportRunRef.current) {
          return;
        }
        const message =
          (e as { response?: { data?: { message?: string } }; message?: string })
            ?.response?.data?.message ||
          (e as Error)?.message ||
          'Detection failed. Please try again.';
        if (isReprocess) {
          // Keep the current review intact.
          setStatus('ready');
          showNotice({ type: 'error', text: `Re-run failed: ${message}` });
        } else {
          setError(message);
          setStatus('error');
        }
      }
    },
    [resetHistory, showNotice]
  );

  /** Load + process a freshly uploaded file. */
  const processUploadedFile = useCallback(
    async (file: File, pageNumber = 1) => {
      const runId = activeImportRunRef.current;
      setStatus('loading');
      setError(null);
      setNotice(null);
      setWarnings([]);
      setProgress({ stage: 'finding', total: 0, done: 0, detail: 'Reading file…' });
      try {
        const loaded = await loadSource(file, pageNumber);
        if (runId !== activeImportRunRef.current) return;
        setSource(loaded);
        setFileName(file.name);
        await runDetection(loaded, false);
      } catch (e) {
        if (runId !== activeImportRunRef.current) return;
        setProgress(null);
        setError((e as Error)?.message || 'Could not read the uploaded file.');
        setStatus('error');
      }
    },
    [runDetection]
  );

  const onUpload = useCallback(
    async (file: File) => {
      const validationError = validateSourceFile(file);
      if (validationError) {
        setError(validationError);
        setStatus('error');
        return;
      }
      try {
        const pageCount = await peekSourcePageCount(file);
        if (pageCount > 1) {
          setPendingPdf({ file, pageCount });
          setStatus('idle');
          return;
        }
        await processUploadedFile(file, 1);
      } catch (e) {
        setError((e as Error)?.message || 'Could not read the uploaded file.');
        setStatus('error');
      }
    },
    [processUploadedFile]
  );

  const confirmPdfPage = useCallback(
    async (pageNumber: number) => {
      if (!pendingPdf) return;
      const { file } = pendingPdf;
      setPendingPdf(null);
      await processUploadedFile(file, pageNumber);
    },
    [pendingPdf, processUploadedFile]
  );

  const cancelPendingPdf = useCallback(() => {
    setPendingPdf(null);
    setStatus('idle');
  }, []);

  /** Clear everything back to the upload state. */
  const reset = useCallback(() => {
    activeImportRunRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    setPendingPdf(null);
    setSource(null);
    setUnitsState([]);
    setWarnings([]);
    setError(null);
    setNotice(null);
    setFileName('');
    setSelectedIds(new Set());
    setHoveredId(null);
    setTool('select');
    resetHistory();
    setStatus('idle');
  }, [resetHistory]);

  /** Cancel import and return to the upload screen. */
  const cancelDetection = useCallback(() => {
    reset();
  }, [reset]);

  /** Re-run detection on the already-loaded source (e.g. after tuning options). */
  const reprocess = useCallback(async () => {
    if (!source) return;
    await runDetection(source, true);
  }, [source, runDetection]);

  // --- Unit mutations (each records history) ---

  const updateUnit = useCallback(
    (id: string, patch: Partial<EditableUnit>, recordHistory = true) => {
      if (recordHistory) snapshot();
      setUnits((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...patch, edited: true } : u))
      );
    },
    [snapshot, setUnits]
  );

  /** Live update during a drag (no history; caller snapshots at drag start). */
  const updateUnitLive = useCallback(
    (id: string, patch: Partial<EditableUnit>) => {
      setUnits((prev) =>
        prev.map((u) => (u.id === id ? { ...u, ...patch, edited: true } : u))
      );
    },
    [setUnits]
  );

  /** Batch live update (multi-move). */
  const updateManyLive = useCallback(
    (updates: { id: string; patch: Partial<EditableUnit> }[]) => {
      if (updates.length === 0) return;
      const byId = new Map(updates.map((u) => [u.id, u.patch]));
      setUnits((prev) =>
        prev.map((u) => {
          const patch = byId.get(u.id);
          return patch ? { ...u, ...patch, edited: true } : u;
        })
      );
    },
    [setUnits]
  );

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addToSelection = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const removeUnit = useCallback(
    (id: string) => {
      snapshot();
      setUnits((prev) => prev.filter((u) => u.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [snapshot, setUnits]
  );

  /** Delete every currently selected box (single snapshot). */
  const removeSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    snapshot();
    setUnits((prev) => prev.filter((u) => !ids.has(u.id)));
    setSelectedIds(new Set());
  }, [snapshot, setUnits]);

  const setUnitLabel = useCallback(
    (id: string, label: string) => {
      snapshot();
      setUnits((prev) =>
        prev.map((u) => {
          if (u.id !== id) return u;
          const trimmed = label.trim();
          return {
            ...u,
            label: trimmed || undefined,
            labelConfidence: 1,
            edited: true,
            kind: trimmed ? 'unit' : u.kind,
          };
        })
      );
    },
    [snapshot, setUnits]
  );

  /** Live label typing — snapshots once on the first keystroke of an edit session. */
  const setUnitLabelLive = useCallback(
    (id: string, label: string) => {
      if (!labelEditSnapshotted.current.has(id)) {
        snapshot();
        labelEditSnapshotted.current.add(id);
      }
      setUnits((prev) =>
        prev.map((u) => {
          if (u.id !== id) return u;
          const trimmed = label.trim();
          return {
            ...u,
            label: trimmed || undefined,
            labelConfidence: 1,
            edited: true,
            kind: trimmed ? 'unit' : u.kind,
          };
        })
      );
    },
    [snapshot, setUnits]
  );

  const finishLabelEdit = useCallback((id: string) => {
    labelEditSnapshotted.current.delete(id);
  }, []);

  /** Merge a door patch onto a unit, marking it a manual override + clamping. */
  const applyDoorPatch = (u: EditableUnit, patch: Partial<UnitDoor>): EditableUnit => {
    const base = u.door ?? defaultDoor(patch.side ?? 'bottom', false);
    const next: UnitDoor = { ...base, ...patch, auto: false };
    next.widthFraction = Math.max(0.1, Math.min(1, next.widthFraction));
    next.offsetFraction = clampDoorOffset(next.offsetFraction, next.widthFraction);
    return { ...u, door: next, edited: true };
  };

  /** Override a unit's door (discrete change, e.g. side button) — one snapshot. */
  const setUnitDoor = useCallback(
    (id: string, patch: Partial<UnitDoor>) => {
      snapshot();
      setUnits((prev) => prev.map((u) => (u.id === id ? applyDoorPatch(u, patch) : u)));
    },
    [snapshot, setUnits]
  );

  /** Live door slider drag — snapshots once at the start of the drag session. */
  const setUnitDoorLive = useCallback(
    (id: string, patch: Partial<UnitDoor>) => {
      if (!doorEditSnapshotted.current.has(id)) {
        snapshot();
        doorEditSnapshotted.current.add(id);
      }
      setUnits((prev) => prev.map((u) => (u.id === id ? applyDoorPatch(u, patch) : u)));
    },
    [snapshot, setUnits]
  );

  const finishDoorEdit = useCallback((id: string) => {
    doorEditSnapshotted.current.delete(id);
  }, []);

  const addUnit = useCallback(
    (unit: Omit<EditableUnit, 'id' | 'manual' | 'kind'>) => {
      snapshot();
      const id = nextManualId();
      const created: EditableUnit = {
        ...unit,
        kind: 'unit',
        id,
        manual: true,
        edited: true,
      };
      setUnits((prev) => [...prev, created]);
      setSelectedIds(new Set([id]));
      return id;
    },
    [snapshot, setUnits]
  );

  const stats: LayoutImportStats = useMemo(() => {
    const total = units.length;
    let edited = 0;
    let manual = 0;
    let withLabel = 0;
    let unitCount = 0;
    let rectCount = 0;
    let confidenceSum = 0;
    for (const u of units) {
      if (u.edited) edited++;
      if (u.manual) manual++;
      if (u.label) withLabel++;
      if (u.kind === 'unit') unitCount++;
      else rectCount++;
      confidenceSum += u.detectionConfidence;
    }
    return {
      total,
      edited,
      manual,
      withLabel,
      unitCount,
      rectCount,
      avgDetectionConfidence: total ? confidenceSum / total : 0,
    };
  }, [units]);

  const selectedId = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    return [...selectedIds][0];
  }, [selectedIds]);

  const selectedUnit = useMemo(
    () => (selectedId ? units.find((u) => u.id === selectedId) ?? null : null),
    [units, selectedId]
  );

  /**
   * Problems the reviewer should resolve: boxes with no unit number and
   * duplicate unit numbers. `errorIds` is a fast membership set for the
   * canvas/list to flag the offending boxes in red.
   */
  const { errors, errorIds } = useMemo(() => {
    const list: LayoutError[] = [];
    const ids = new Set<string>();

    const byLabel = new Map<string, EditableUnit[]>();
    for (const u of units) {
      const key = labelKey(u);
      if (!key) continue;
      const arr = byLabel.get(key);
      if (arr) arr.push(u);
      else byLabel.set(key, [u]);
    }
    for (const arr of byLabel.values()) {
      if (arr.length < 2) continue;
      const importable = arr.filter(isImportEligible);
      if (importable.length < 2) continue;
      for (const u of importable) {
        list.push({
          id: `dup-${u.id}`,
          unitId: u.id,
          type: 'duplicate-label',
          message: `Duplicate label "${u.label}" (${arr.length}×)`,
        });
        ids.add(u.id);
      }
    }

    for (const u of units) {
      if (labelKey(u)) continue;
      if (u.kind !== 'unit') continue;
      list.push({
        id: `nolabel-${u.id}`,
        unitId: u.id,
        type: 'no-label',
        message: 'Storage unit with no unit number',
      });
      ids.add(u.id);
    }

    return { errors: list, errorIds: ids };
  }, [units]);

  /** Problem units in canvas/list order (deduped). */
  const problemUnitIds = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const u of units) {
      if (errorIds.has(u.id) && !seen.has(u.id)) {
        ordered.push(u.id);
        seen.add(u.id);
      }
    }
    return ordered;
  }, [units, errorIds]);

  /** Select the next problem unit after `currentId` (wraps). Returns the new id or null if none. */
  const selectNextProblemUnit = useCallback(
    (currentId?: string | null): string | null => {
      if (problemUnitIds.length === 0) return null;
      const idx = currentId ? problemUnitIds.indexOf(currentId) : -1;
      const nextIdx = idx >= 0 ? (idx + 1) % problemUnitIds.length : 0;
      const nextId = problemUnitIds[nextIdx];
      setSelectedIds(new Set([nextId]));
      return nextId;
    },
    [problemUnitIds]
  );

  /** Serialize the current review (image embedded) and download it as a file. */
  const exportProject = useCallback(async () => {
    if (!source) return;
    const dataUrl = await fileToDataUrl(source.uploadFile);
    const payload = {
      kind: PROJECT_FILE_KIND,
      version: PROJECT_FILE_VERSION,
      savedAt: new Date().toISOString(),
      fileName,
      image: {
        dataUrl,
        width: source.width,
        height: source.height,
        rasterizedFromPdf: source.rasterizedFromPdf,
      },
      options: optionsRef.current,
      units: unitsRef.current,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(fileName || 'layout').replace(/\.[^.]+$/, '')}.bludesign.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showNotice({ type: 'success', text: 'Saved layout to file.' });
  }, [source, fileName, showNotice]);

  /** Restore a previously saved review from a file (no re-OCR required). */
  const importProject = useCallback(
    async (file: File) => {
      setStatus('loading');
      setError(null);
      setNotice(null);
      try {
        const parsed = JSON.parse(await file.text());
        const data = validateImportProjectData(parsed);
        const blob = await (await fetch(data.image.dataUrl)).blob();
        const restoredName: string = data.fileName || 'layout.png';
        const uploadFile = new File([blob], restoredName, {
          type: blob.type || 'image/png',
        });
        const previewUrl = URL.createObjectURL(blob);

        abortRef.current?.abort();
        setProgress(null);
        // Replacing `source` triggers the cleanup effect that revokes the old URL.
        setSource({
          uploadFile,
          previewUrl,
          width: data.image.width,
          height: data.image.height,
          pageCount: 1,
          rasterizedFromPdf: !!data.image.rasterizedFromPdf,
        });
        setFileName(restoredName);
        setUnitsState(data.units);
        setOptions(data.options ?? {});
        setWarnings([]);
        setSelectedIds(new Set());
        setHoveredId(null);
        resetHistory();
        setStatus('ready');
        showNotice({ type: 'success', text: `Loaded ${data.units.length} saved box${data.units.length === 1 ? '' : 'es'}.` });
      } catch (e) {
        setError((e as Error)?.message || 'Could not load the file.');
        setStatus('error');
      }
    },
    [resetHistory, showNotice]
  );

  return {
    // source
    source,
    fileName,
    status,
    error,
    notice,
    clearNotice: () => setNotice(null),
    warnings,
    progress,
    pendingPdf,
    confirmPdfPage,
    cancelPendingPdf,
    cancelDetection,
    // units
    units,
    stats,
    selectedUnit,
    errors,
    errorIds,
    problemUnitIds,
    selectNextProblemUnit,
    // selection / hover / tool
    selectedIds,
    selectedId,
    setSelectedId,
    setSelection,
    toggleSelectedId,
    addToSelection,
    hoveredId,
    setHoveredId,
    tool,
    setTool,
    // options
    options,
    setOptions,
    // display prefs
    showLabels,
    setShowLabels,
    showImage,
    setShowImage,
    showNonUnits,
    setShowNonUnits,
    showDoors,
    setShowDoors,
    // workflow
    onUpload,
    reprocess,
    reset,
    exportProject,
    importProject,
    // mutations
    snapshot,
    updateUnit,
    updateUnitLive,
    updateManyLive,
    removeUnit,
    removeSelected,
    setUnitLabel,
    setUnitLabelLive,
    finishLabelEdit,
    setUnitDoor,
    setUnitDoorLive,
    finishDoorEdit,
    addUnit,
    // history
    undo,
    redo,
    showNotice,
    canUndo,
    canRedo,
  };
}

export type LayoutImportController = ReturnType<typeof useLayoutImport>;
