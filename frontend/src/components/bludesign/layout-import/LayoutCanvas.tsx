/**
 * BluDesign Layout Import — Interactive review canvas
 *
 * Renders the source plan with an SVG overlay of detected rotated-rect units.
 * Supports pan/zoom, hover details, selection, and direct manipulation
 * (move / rotate / corner-resize) plus drawing new units. All geometry stays in
 * source-image pixel space; screen↔image conversion uses the live SVG CTM.
 *
 * Performance/correctness notes:
 *  - Global pointer + wheel + key listeners are mounted once and read live state
 *    from refs, so per-frame dragging doesn't churn React subscriptions.
 *  - Per-unit shapes are memoized; only the moved/hovered unit re-renders.
 *  - The wheel listener is attached natively with `{ passive: false }` because
 *    React's synthetic onWheel is passive and cannot preventDefault.
 *  - Undo snapshots are taken lazily on the first real drag movement, so a plain
 *    click-to-select never pollutes the undo history.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
} from 'react';
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import type { LoadedSource } from './loadSource';
import type { EditableUnit, EditorTool } from './types';
import { overlayColor, DOOR_COLOR } from './colors';
import {
  CORNER_ORDER,
  cornerSign,
  normalizeRotation,
  rectPointsAttr,
  resizeRectByCorner,
  toWorld,
  aabb,
  unitIntersectsMarquee,
  doorSegment,
  type CornerId,
  type Point,
  type AxisRect,
} from './geometry';
import { UnitHoverCard } from './UnitHoverCard';

interface NewUnitInput {
  bounds: EditableUnit['bounds'];
  rotationRad: number;
  detectionConfidence: number;
  labelConfidence: number;
}

interface LayoutCanvasProps {
  source: LoadedSource;
  units: EditableUnit[];
  selectedIds: Set<string>;
  /** Unit highlighted from outside the canvas (e.g. the unit list). */
  hoveredId?: string | null;
  tool: EditorTool;
  showLabels: boolean;
  /** When false, the original plan image is hidden (overlay-only review). */
  showImage: boolean;
  /** Ids of boxes flagged as problems — drawn in red. */
  errorIds: Set<string>;
  /** When false, unlabeled rectangles ("likely not a unit") are hidden. */
  showNonUnits: boolean;
  /** When false, per-unit door markers are hidden. */
  showDoors: boolean;
  onSelect: (id: string | null) => void;
  onSelectMany: (ids: string[]) => void;
  onToggleSelect: (id: string) => void;
  onAddToSelection: (ids: string[]) => void;
  onSnapshot: () => void;
  onUpdateLive: (id: string, patch: Partial<EditableUnit>) => void;
  onUpdateManyLive: (updates: { id: string; patch: Partial<EditableUnit> }[]) => void;
  onAddUnit: (unit: NewUnitInput) => void;
  onDeleteSelected: () => void;
}

export interface LayoutCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  resetZoom: () => void;
  /** Smoothly animate the view to center + zoom on a unit. */
  focusUnit: (unit: EditableUnit) => void;
}

type DragMode = 'none' | 'move' | 'rotate' | 'resize' | 'pan' | 'create' | 'marquee';

interface DragState {
  mode: DragMode;
  button?: number;
  pointerId: number;
  startImg: Point;
  startClient: Point;
  /** Take an undo snapshot on the first real movement, not on mere click. */
  pendingSnapshot: boolean;
  moved: boolean;
  origin?: { cx: number; cy: number };
  /** Starting centers for every box in a multi-move drag. */
  moveOrigins?: Map<string, { cx: number; cy: number }>;
  corner?: CornerId;
  startPan?: { x: number; y: number };
  /** Latest in-progress create rectangle (image space). */
  createRect?: { x: number; y: number; w: number; h: number };
  /** Marquee selection rectangle (image space). */
  marqueeRect?: AxisRect;
  /** Shift held at marquee start — add to existing selection. */
  additive?: boolean;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const CREATE_MIN_SIZE = 6;

export const LayoutCanvas = forwardRef<LayoutCanvasHandle, LayoutCanvasProps>(
  function LayoutCanvas(props, ref) {
    const {
      source,
      units,
      selectedIds,
      hoveredId,
      tool,
      showLabels,
      showImage,
      errorIds,
      showNonUnits,
      showDoors,
      onSelect,
      onSelectMany,
      onToggleSelect,
      onAddToSelection,
      onSnapshot,
      onUpdateLive,
      onUpdateManyLive,
      onAddUnit,
      onDeleteSelected,
    } = props;

    const { effectiveTheme } = useTheme();
    const isDark = effectiveTheme === 'dark';

    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const contentRef = useRef<SVGGElement>(null);

    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
    const [creating, setCreating] = useState<null | { x: number; y: number; w: number; h: number }>(null);
    const [marquee, setMarquee] = useState<null | AxisRect>(null);
    const [isDragging, setIsDragging] = useState(false);

    const drag = useRef<DragState | null>(null);
    const didInteract = useRef(false);
    // Live mirrors for the focus animation (reads current view without re-binding).
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const panRef = useRef(pan);
    panRef.current = pan;
    const animRef = useRef<number | null>(null);

    /** Cancel any in-flight view animation (user took over). */
    const cancelAnim = useCallback(() => {
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    }, []);
    useEffect(() => () => cancelAnim(), [cancelAnim]);

    /** Tween zoom + pan to a target with easeOutCubic. */
    const animateView = useCallback(
      (targetZoom: number, targetPan: { x: number; y: number }, duration = 420) => {
        cancelAnim();
        const z0 = zoomRef.current;
        const p0 = { ...panRef.current };
        const t0 = performance.now();
        const ease = (t: number) => 1 - Math.pow(1 - t, 3);
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / duration);
          const e = ease(t);
          setZoom(z0 + (targetZoom - z0) * e);
          setPan({
            x: p0.x + (targetPan.x - p0.x) * e,
            y: p0.y + (targetPan.y - p0.y) * e,
          });
          if (t < 1) animRef.current = requestAnimationFrame(step);
          else animRef.current = null;
        };
        animRef.current = requestAnimationFrame(step);
      },
      [cancelAnim]
    );

    // Live mirrors of props/state for the once-mounted global listeners.
    const unitsRef = useRef(units);
    unitsRef.current = units;
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;
    const toolRef = useRef(tool);
    toolRef.current = tool;
    const cb = useRef({
      onUpdateLive,
      onUpdateManyLive,
      onAddUnit,
      onSnapshot,
      onSelect,
      onSelectMany,
      onToggleSelect,
      onAddToSelection,
      onDeleteSelected,
    });
    cb.current = {
      onUpdateLive,
      onUpdateManyLive,
      onAddUnit,
      onSnapshot,
      onSelect,
      onSelectMany,
      onToggleSelect,
      onAddToSelection,
      onDeleteSelected,
    };

    // --- coordinate conversion ---
    const toImagePoint = useCallback((clientX: number, clientY: number): Point => {
      const content = contentRef.current;
      const svg = svgRef.current;
      if (!content || !svg) return { x: 0, y: 0 };
      const ctm = content.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const res = pt.matrixTransform(ctm.inverse());
      return { x: res.x, y: res.y };
    }, []);

    // --- view helpers ---
    const fit = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      const { clientWidth: cw, clientHeight: ch } = el;
      if (!cw || !ch) return;
      const z = Math.min(cw / source.width, ch / source.height) * 0.95;
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      setZoom(clamped);
      setPan({
        x: (cw - source.width * clamped) / 2,
        y: (ch - source.height * clamped) / 2,
      });
    }, [source.width, source.height]);

    const zoomAt = useCallback((factor: number, px: number, py: number) => {
      setZoom((z) => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
        setPan((p) => ({
          x: px - ((px - p.x) * next) / z,
          y: py - ((py - p.y) * next) / z,
        }));
        return next;
      });
    }, []);

    const zoomAtCenter = useCallback(
      (factor: number) => {
        const el = containerRef.current;
        if (!el) return;
        zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
      },
      [zoomAt]
    );

    const resetZoom = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      setZoom(1);
      setPan({
        x: (el.clientWidth - source.width) / 2,
        y: (el.clientHeight - source.height) / 2,
      });
    }, [source.width, source.height]);

    const focusUnit = useCallback(
      (unit: EditableUnit) => {
        const el = containerRef.current;
        if (!el) return;
        const { clientWidth: cw, clientHeight: ch } = el;
        if (!cw || !ch) return;
        const box = aabb(unit.bounds, unit.rotationRad);
        const pad = 1.8; // leave breathing room around the focused unit
        const fitZoom = Math.min(cw / (box.width * pad), ch / (box.height * pad));
        // Zoom in for a close look, but never absurdly far for tiny boxes.
        const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(fitZoom, 6)));
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        didInteract.current = true;
        animateView(targetZoom, { x: cw / 2 - cx * targetZoom, y: ch / 2 - cy * targetZoom });
      },
      [animateView]
    );

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => zoomAtCenter(1.2),
        zoomOut: () => zoomAtCenter(1 / 1.2),
        fit,
        resetZoom,
        focusUnit,
      }),
      [zoomAtCenter, fit, resetZoom, focusUnit]
    );

    // Fit when the source changes.
    useLayoutEffect(() => {
      didInteract.current = false;
      fit();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source.previewUrl]);

    // Refit on container resize until the user interacts.
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        if (!didInteract.current) fit();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [fit]);

    // --- native wheel zoom (non-passive so we can preventDefault) ---
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        didInteract.current = true;
        cancelAnim();
        const rect = el.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }, [zoomAt, cancelAnim]);

    // --- global pointer move/up (mounted once; reads live refs) ---
    useEffect(() => {
      const ensureSnapshot = (d: DragState) => {
        if (d.pendingSnapshot) {
          cb.current.onSnapshot();
          d.pendingSnapshot = false;
        }
      };

      const onMove = (e: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const img = toImagePoint(e.clientX, e.clientY);

        if (d.mode === 'pan' && d.startPan) {
          d.moved = true;
          setPan({
            x: d.startPan.x + (e.clientX - d.startClient.x),
            y: d.startPan.y + (e.clientY - d.startClient.y),
          });
          return;
        }

        if (d.mode === 'create') {
          const x = Math.min(d.startImg.x, img.x);
          const y = Math.min(d.startImg.y, img.y);
          const w = Math.abs(img.x - d.startImg.x);
          const h = Math.abs(img.y - d.startImg.y);
          d.createRect = { x, y, w, h };
          d.moved = true;
          setCreating({ x, y, w, h });
          return;
        }

        if (d.mode === 'marquee') {
          const x = Math.min(d.startImg.x, img.x);
          const y = Math.min(d.startImg.y, img.y);
          const w = Math.abs(img.x - d.startImg.x);
          const h = Math.abs(img.y - d.startImg.y);
          d.marqueeRect = { x, y, width: w, height: h };
          d.moved = true;
          setMarquee({ x, y, width: w, height: h });
          return;
        }

        if (d.mode === 'move' && d.moveOrigins) {
          const dx = img.x - d.startImg.x;
          const dy = img.y - d.startImg.y;
          if (dx === 0 && dy === 0) return;
          ensureSnapshot(d);
          d.moved = true;
          const updates: { id: string; patch: Partial<EditableUnit> }[] = [];
          for (const [id, origin] of d.moveOrigins) {
            const unit = unitsRef.current.find((u) => u.id === id);
            if (!unit) continue;
            updates.push({
              id,
              patch: { bounds: { ...unit.bounds, cx: origin.cx + dx, cy: origin.cy + dy } },
            });
          }
          if (updates.length === 1) cb.current.onUpdateLive(updates[0].id, updates[0].patch);
          else cb.current.onUpdateManyLive(updates);
          return;
        }

        const primaryId = [...selectedIdsRef.current][0];
        const unit = primaryId ? unitsRef.current.find((u) => u.id === primaryId) : undefined;
        if (!unit) return;

        if (d.mode === 'resize' && d.corner) {
          ensureSnapshot(d);
          d.moved = true;
          const next = resizeRectByCorner(unit.bounds, unit.rotationRad, d.corner, img);
          cb.current.onUpdateLive(unit.id, { bounds: next });
        } else if (d.mode === 'rotate') {
          ensureSnapshot(d);
          d.moved = true;
          const vx = img.x - unit.bounds.cx;
          const vy = img.y - unit.bounds.cy;
          let rot = Math.atan2(vx, -vy);
          if (e.shiftKey) {
            const step = Math.PI / 12; // 15° snap
            rot = Math.round(rot / step) * step;
          }
          cb.current.onUpdateLive(unit.id, { rotationRad: normalizeRotation(rot) });
        }
      };

      const onUp = () => {
        const d = drag.current;
        drag.current = null;
        setIsDragging(false);
        if (!d) return;
        if (d.mode === 'create') {
          setCreating(null);
          const c = d.createRect;
          if (c && c.w >= CREATE_MIN_SIZE && c.h >= CREATE_MIN_SIZE) {
            cb.current.onSnapshot();
            cb.current.onAddUnit({
              bounds: { cx: c.x + c.w / 2, cy: c.y + c.h / 2, width: c.w, height: c.h },
              rotationRad: 0,
              detectionConfidence: 1,
              labelConfidence: 0,
            });
          }
          return;
        }
        if (d.mode === 'marquee') {
          setMarquee(null);
          const m = d.marqueeRect;
          if (!m || (!d.moved && m.width < 4 && m.height < 4)) {
            if (!d.additive) cb.current.onSelect(null);
            return;
          }
          if (m.width < 4 && m.height < 4) {
            if (!d.additive) cb.current.onSelect(null);
            return;
          }
          const hits = unitsRef.current
            .filter((u) => unitIntersectsMarquee(u.bounds, u.rotationRad, m))
            .map((u) => u.id);
          if (d.additive) cb.current.onAddToSelection(hits);
          else cb.current.onSelectMany(hits);
          return;
        }
        if (d.mode === 'pan' && !d.moved && d.button === 0) {
          cb.current.onSelect(null);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }, [toImagePoint]);

    // --- background pointer down (pan / create / deselect) ---
    const onBackgroundPointerDown = useCallback(
      (e: React.PointerEvent) => {
        didInteract.current = true;
        cancelAnim();

        const startPanDrag = () => {
          setIsDragging(true);
          drag.current = {
            mode: 'pan',
            button: e.button,
            pointerId: e.pointerId,
            startImg: { x: 0, y: 0 },
            startClient: { x: e.clientX, y: e.clientY },
            startPan: { ...pan },
            pendingSnapshot: false,
            moved: false,
          };
        };

        if (e.button === 1 || e.button === 2) {
          startPanDrag();
          return;
        }
        if (tool === 'add' && e.button === 0) {
          const img = toImagePoint(e.clientX, e.clientY);
          setIsDragging(true);
          drag.current = {
            mode: 'create',
            pointerId: e.pointerId,
            startImg: img,
            startClient: { x: e.clientX, y: e.clientY },
            pendingSnapshot: false,
            moved: false,
            createRect: { x: img.x, y: img.y, w: 0, h: 0 },
          };
          setCreating({ x: img.x, y: img.y, w: 0, h: 0 });
          return;
        }
        if (tool === 'select' && e.button === 0) {
          if (e.shiftKey) {
            const img = toImagePoint(e.clientX, e.clientY);
            setIsDragging(true);
            drag.current = {
              mode: 'marquee',
              pointerId: e.pointerId,
              startImg: img,
              startClient: { x: e.clientX, y: e.clientY },
              pendingSnapshot: false,
              moved: false,
              marqueeRect: { x: img.x, y: img.y, width: 0, height: 0 },
              additive: false,
            };
            setMarquee({ x: img.x, y: img.y, width: 0, height: 0 });
            return;
          }
          startPanDrag();
        }
      },
      [tool, pan, toImagePoint, cancelAnim]
    );

    // --- stable per-unit handlers (so memoized shapes don't re-render) ---
    const handleUnitPointerDown = useCallback(
      (e: React.PointerEvent, id: string) => {
        e.stopPropagation();
        cancelAnim();

        const toggle = e.ctrlKey || e.metaKey;
        const extend = e.shiftKey;
        const sel = selectedIdsRef.current;
        if (toggle) cb.current.onToggleSelect(id);
        else if (extend) {
          if (!sel.has(id)) cb.current.onAddToSelection([id]);
        } else if (!(sel.has(id) && sel.size > 1)) {
          cb.current.onSelect(id);
        }

        if (toolRef.current !== 'select') return;
        const unit = unitsRef.current.find((u) => u.id === id);
        if (!unit) return;

        const movingIds = !toggle && !extend && sel.has(id) && sel.size > 1 ? [...sel] : [id];
        const moveOrigins = new Map<string, { cx: number; cy: number }>();
        for (const mid of movingIds) {
          const u = unitsRef.current.find((x) => x.id === mid);
          if (u) moveOrigins.set(mid, { cx: u.bounds.cx, cy: u.bounds.cy });
        }

        setIsDragging(true);
        drag.current = {
          mode: 'move',
          pointerId: e.pointerId,
          startImg: toImagePoint(e.clientX, e.clientY),
          startClient: { x: e.clientX, y: e.clientY },
          origin: { cx: unit.bounds.cx, cy: unit.bounds.cy },
          moveOrigins,
          pendingSnapshot: true,
          moved: false,
        };
      },
      [toImagePoint, cancelAnim]
    );

    const handleUnitEnter = useCallback((e: React.PointerEvent, id: string) => {
      setHover({ id, x: e.clientX, y: e.clientY });
    }, []);
    const handleUnitMove = useCallback((e: React.PointerEvent, id: string) => {
      setHover((h) => (h && h.id === id ? { ...h, x: e.clientX, y: e.clientY } : h));
    }, []);
    const handleUnitLeave = useCallback((id: string) => {
      setHover((h) => (h?.id === id ? null : h));
    }, []);

    const startResize = useCallback(
      (e: React.PointerEvent, _unit: EditableUnit, corner: CornerId) => {
        e.stopPropagation();
        setIsDragging(true);
        drag.current = {
          mode: 'resize',
          pointerId: e.pointerId,
          startImg: toImagePoint(e.clientX, e.clientY),
          startClient: { x: e.clientX, y: e.clientY },
          corner,
          pendingSnapshot: true,
          moved: false,
        };
      },
      [toImagePoint]
    );

    const startRotate = useCallback(
      (e: React.PointerEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        drag.current = {
          mode: 'rotate',
          pointerId: e.pointerId,
          startImg: toImagePoint(e.clientX, e.clientY),
          startClient: { x: e.clientX, y: e.clientY },
          pendingSnapshot: true,
          moved: false,
        };
      },
      [toImagePoint]
    );

    // --- keyboard: delete / nudge (mounted once; reads live refs) ---
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        if (target?.closest('[data-layout-import-sidebar]')) return;
        const ids = selectedIdsRef.current;
        if (ids.size === 0) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          cb.current.onDeleteSelected();
          return;
        }
        const step = e.shiftKey ? 10 : 1;
        const nudge: Record<string, [number, number]> = {
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
        };
        if (nudge[e.key]) {
          e.preventDefault();
          const [dx, dy] = nudge[e.key];
          cb.current.onSnapshot();
          const updates: { id: string; patch: Partial<EditableUnit> }[] = [];
          for (const id of ids) {
            const unit = unitsRef.current.find((u) => u.id === id);
            if (!unit) continue;
            updates.push({
              id,
              patch: { bounds: { ...unit.bounds, cx: unit.bounds.cx + dx, cy: unit.bounds.cy + dy } },
            });
          }
          if (updates.length === 1) cb.current.onUpdateLive(updates[0].id, updates[0].patch);
          else cb.current.onUpdateManyLive(updates);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Screen-constant sizes (in image units).
    const handleR = 5 / zoom;
    const strokeW = 1.5 / zoom;
    const selectedStrokeW = 2.5 / zoom;
    const rotateOffset = 26 / zoom;

    const selected =
      selectedIds.size === 1 ? units.find((u) => u.id === [...selectedIds][0]) ?? null : null;
    const cursorClass =
      tool === 'add'
        ? 'cursor-crosshair'
        : isDragging && marquee
          ? 'cursor-crosshair'
          : isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab';

    return (
      <div
        ref={containerRef}
        className={`relative w-full h-full overflow-hidden select-none ${isDark ? 'bg-gray-950' : 'bg-gray-100'}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Checkerboard backdrop for transparency awareness */}
        <div
          className="absolute inset-0 opacity-[0.35] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(45deg, rgba(128,128,128,0.15) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.15) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.15) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.15) 75%)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
          }}
        />

        <svg
          ref={svgRef}
          className={`absolute inset-0 w-full h-full ${cursorClass}`}
          onPointerDown={onBackgroundPointerDown}
        >
          <g ref={contentRef} transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {showImage ? (
              <image
                href={source.previewUrl}
                width={source.width}
                height={source.height}
                style={{ imageRendering: zoom > 2 ? 'pixelated' : 'auto' }}
              />
            ) : (
              // Clean backdrop when the plan is hidden, so boxes read clearly.
              <rect
                width={source.width}
                height={source.height}
                fill={isDark ? '#0b0f17' : '#f8fafc'}
              />
            )}

            {/* Detected units */}
            {units.map((u) =>
              !showNonUnits && u.kind === 'rectangle' ? null : (
              <UnitShape
                key={u.id}
                unit={u}
                isSelected={selectedIds.has(u.id)}
                isHighlight={!selectedIds.has(u.id) && (hover?.id === u.id || hoveredId === u.id)}
                isError={errorIds.has(u.id)}
                showImage={showImage}
                showLabels={showLabels}
                isDark={isDark}
                zoom={zoom}
                tool={tool}
                strokeW={strokeW}
                selectedStrokeW={selectedStrokeW}
                onPointerDown={handleUnitPointerDown}
                onEnter={handleUnitEnter}
                onMove={handleUnitMove}
                onLeave={handleUnitLeave}
              />
              )
            )}

            {/* Door markers — drawn above all units so they're never occluded */}
            {showDoors &&
              units.map((u) =>
                u.door && (showNonUnits || u.kind !== 'rectangle') ? (
                  <DoorMarker key={`door-${u.id}`} unit={u} zoom={zoom} />
                ) : null
              )}

            {/* Selection gizmo */}
            {selected && tool === 'select' && (
              <SelectionGizmo
                unit={selected}
                handleR={handleR}
                strokeW={selectedStrokeW}
                rotateOffset={rotateOffset}
                onResizeStart={startResize}
                onRotateStart={startRotate}
              />
            )}

            {/* Live create rectangle */}
            {creating && (
              <rect
                x={creating.x}
                y={creating.y}
                width={creating.w}
                height={creating.h}
                fill="rgba(20,127,212,0.18)"
                stroke="#147FD4"
                strokeWidth={strokeW}
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                pointerEvents="none"
              />
            )}

            {marquee && (
              <rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.width}
                height={marquee.height}
                fill="rgba(20,127,212,0.12)"
                stroke="#147FD4"
                strokeWidth={strokeW}
                strokeDasharray={`${5 / zoom} ${4 / zoom}`}
                pointerEvents="none"
              />
            )}
          </g>
        </svg>

        {/* Floating zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
          <ZoomButton isDark={isDark} title="Zoom in" onClick={() => zoomAtCenter(1.2)}>
            <MagnifyingGlassPlusIcon className="w-4 h-4" />
          </ZoomButton>
          <ZoomButton isDark={isDark} title="Zoom out" onClick={() => zoomAtCenter(1 / 1.2)}>
            <MagnifyingGlassMinusIcon className="w-4 h-4" />
          </ZoomButton>
          <ZoomButton isDark={isDark} title="Fit to view" onClick={fit}>
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </ZoomButton>
          <ZoomButton isDark={isDark} title="Reset to 100%" onClick={resetZoom}>
            <ViewfinderCircleIcon className="w-4 h-4" />
          </ZoomButton>
        </div>

        {/* Zoom level badge */}
        <div
          className={`absolute bottom-4 left-4 px-2.5 py-1 rounded-lg text-xs font-medium tabular-nums ${
            isDark ? 'bg-gray-800/90 text-gray-200' : 'bg-white/90 text-gray-700 shadow-sm'
          }`}
        >
          {Math.round(zoom * 100)}%
        </div>

        {/* Hover card (suppressed while dragging) */}
        {hover && !isDragging && (() => {
          const u = units.find((x) => x.id === hover.id);
          return u ? <UnitHoverCard unit={u} x={hover.x} y={hover.y} /> : null;
        })()}
      </div>
    );
  }
);

interface UnitShapeProps {
  unit: EditableUnit;
  isSelected: boolean;
  isHighlight: boolean;
  /** Box is flagged as a problem (no label / duplicate) — render red. */
  isError: boolean;
  /** Whether the plan image is shown (drives fill opacity + label contrast). */
  showImage: boolean;
  showLabels: boolean;
  isDark: boolean;
  zoom: number;
  tool: EditorTool;
  strokeW: number;
  selectedStrokeW: number;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onEnter: (e: React.PointerEvent, id: string) => void;
  onMove: (e: React.PointerEvent, id: string) => void;
  onLeave: (id: string) => void;
}

const UnitShape = memo(function UnitShape({
  unit,
  isSelected,
  isHighlight,
  isError,
  showImage,
  showLabels,
  isDark,
  zoom,
  tool,
  strokeW,
  selectedStrokeW,
  onPointerDown,
  onEnter,
  onMove,
  onLeave,
}: UnitShapeProps) {
  const err = isError;
  // With the image visible, keep fills translucent so the plan shows through;
  // with it hidden, fills go near-solid so boxes read on the clean backdrop.
  const baseFill = showImage ? 0.16 : 0.78;
  const hiFill = showImage ? 0.32 : 0.92;
  const fillOpacity = isHighlight || isSelected ? hiFill : baseFill;
  const { stroke, fill } = overlayColor(err, fillOpacity);
  const isNonUnit = unit.kind === 'rectangle';
  const labelFill = showImage ? stroke : isDark ? '#ffffff' : '#0b2942';
  const labelHalo = showImage ? (isDark ? '#0b0f17' : '#ffffff') : err ? '#7f1d1d' : '#0b3a66';

  return (
    <g>
      <polygon
        points={rectPointsAttr(unit.bounds, unit.rotationRad)}
        fill={fill}
        stroke={stroke}
        strokeWidth={isSelected ? selectedStrokeW : isHighlight ? strokeW * 1.8 : strokeW}
        strokeDasharray={isNonUnit ? `${4 / zoom} ${3 / zoom}` : undefined}
        style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}
        onPointerDown={(e) => onPointerDown(e, unit.id)}
        onPointerEnter={(e) => onEnter(e, unit.id)}
        onPointerMove={(e) => onMove(e, unit.id)}
        onPointerLeave={() => onLeave(unit.id)}
      />
      {showLabels && unit.label && (
        <text
          x={unit.bounds.cx}
          y={unit.bounds.cy}
          fontSize={Math.min(unit.bounds.width, unit.bounds.height) * 0.4}
          fill={labelFill}
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
          style={{ paintOrder: 'stroke', stroke: labelHalo, strokeWidth: 0.8 / zoom }}
        >
          {unit.label}
        </text>
      )}
    </g>
  );
});

/**
 * Draws the door as a bold amber bar over the unit's edge (roll-up doors open
 * vertically, so there's no hinge/swing). Short inward jamb ticks at each end
 * make the opening read clearly. Rendered in a layer above all units so a door
 * is never hidden by a neighbouring unit's fill.
 */
const DoorMarker: React.FC<{ unit: EditableUnit; zoom: number }> = ({ unit, zoom }) => {
  if (!unit.door) return null;
  const seg = doorSegment(unit.bounds, unit.rotationRad, unit.door);
  if (seg.length <= 0) return null;

  const openingW = 4 / zoom;
  // Inward direction (into the unit) for the jamb ticks.
  const inward = { x: -seg.normal.x, y: -seg.normal.y };
  const jamb = Math.min(6 / zoom, seg.length * 0.4);
  const tick = (p: { x: number; y: number }) =>
    `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${(p.x + inward.x * jamb).toFixed(2)} ${(p.y + inward.y * jamb).toFixed(2)}`;

  return (
    <g pointerEvents="none">
      {/* White halo so the bar reads on any fill */}
      <line
        x1={seg.a.x}
        y1={seg.a.y}
        x2={seg.b.x}
        y2={seg.b.y}
        stroke="#ffffff"
        strokeWidth={openingW + 2 / zoom}
        strokeLinecap="round"
        strokeOpacity={0.55}
      />
      <line
        x1={seg.a.x}
        y1={seg.a.y}
        x2={seg.b.x}
        y2={seg.b.y}
        stroke={DOOR_COLOR}
        strokeWidth={openingW}
        strokeLinecap="round"
      />
      <path d={`${tick(seg.a)} ${tick(seg.b)}`} stroke={DOOR_COLOR} strokeWidth={1.5 / zoom} fill="none" />
    </g>
  );
};

const ZoomButton: React.FC<{
  isDark: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ isDark, title, onClick, children }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`
      flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150
      hover:scale-105 active:scale-95
      ${isDark
        ? 'bg-gray-800/90 border-gray-700 text-gray-200 hover:bg-gray-700'
        : 'bg-white/95 border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm'
      }
    `}
  >
    {children}
  </button>
);

const SelectionGizmo: React.FC<{
  unit: EditableUnit;
  handleR: number;
  strokeW: number;
  rotateOffset: number;
  onResizeStart: (e: React.PointerEvent, unit: EditableUnit, corner: CornerId) => void;
  onRotateStart: (e: React.PointerEvent) => void;
}> = ({ unit, handleR, strokeW, rotateOffset, onResizeStart, onRotateStart }) => {
  const { bounds, rotationRad } = unit;
  const corner = (c: CornerId): Point => {
    const s = cornerSign(c);
    const local = { x: (s.x * bounds.width) / 2, y: (s.y * bounds.height) / 2 };
    const w = toWorld(local.x, local.y, rotationRad);
    return { x: bounds.cx + w.x, y: bounds.cy + w.y };
  };
  // Rotation handle anchored above the top edge.
  const topMid = toWorld(0, -bounds.height / 2, rotationRad);
  const rotPos = toWorld(0, -bounds.height / 2 - rotateOffset, rotationRad);
  const topMidPt = { x: bounds.cx + topMid.x, y: bounds.cy + topMid.y };
  const rotPt = { x: bounds.cx + rotPos.x, y: bounds.cy + rotPos.y };

  return (
    <g>
      {/* Rotation arm */}
      <line
        x1={topMidPt.x}
        y1={topMidPt.y}
        x2={rotPt.x}
        y2={rotPt.y}
        stroke="#147FD4"
        strokeWidth={strokeW}
      />
      <circle
        cx={rotPt.x}
        cy={rotPt.y}
        r={handleR * 1.1}
        fill="#ffffff"
        stroke="#147FD4"
        strokeWidth={strokeW}
        style={{ cursor: 'grab' }}
        onPointerDown={onRotateStart}
      />
      {/* Corner resize handles */}
      {CORNER_ORDER.map((c) => {
        const p = corner(c);
        return (
          <rect
            key={c}
            x={p.x - handleR}
            y={p.y - handleR}
            width={handleR * 2}
            height={handleR * 2}
            fill="#ffffff"
            stroke="#147FD4"
            strokeWidth={strokeW}
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={(e) => onResizeStart(e, unit, c)}
          />
        );
      })}
    </g>
  );
};
