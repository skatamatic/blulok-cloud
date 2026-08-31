/**
 * Read-only 2D layout viewer for imported facilities.
 *
 * Pan/zoom over pixel-space unit overlays. Used in the editor (with optional
 * source image) and the dashboard widget (vector overlay + live state colors).
 */

import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import type { EditableUnit } from './types';
import { overlayColor, hexToRgba, type OverlayColor } from './colors';
import { selectionStrokeColor } from './layoutImportMetadata';
import { aabb, rectPointsAttr } from './geometry';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const EMPTY_SELECTED = new Set<string>();

export interface ImportedLayoutViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  focusUnit: (unitId: string) => void;
}

export interface ImportedLayoutViewerProps {
  imageWidth: number;
  imageHeight: number;
  units: EditableUnit[];
  /** When set, drawn beneath the vector overlay. */
  imageUrl?: string | null;
  showImage?: boolean;
  showLabels?: boolean;
  selectedIds?: ReadonlySet<string>;
  hoveredId?: string | null;
  /** Override per-unit colors (live state in dashboard). */
  getUnitColor?: (unitId: string) => OverlayColor;
  /** When true, unit fill/stroke are drawn at reduced opacity (e.g. unbound in editor). */
  isUnitDimmed?: (unitId: string) => boolean;
  onSelect?: (unitId: string | null) => void;
  className?: string;
}

interface UnitShapeProps {
  unit: EditableUnit;
  isSelected: boolean;
  isDimmed: boolean;
  showImage: boolean;
  showLabels: boolean;
  isDark: boolean;
  zoom: number;
  colors: OverlayColor;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
}

const UnitShape = memo(function UnitShape({
  unit,
  isSelected,
  isDimmed,
  showImage,
  showLabels,
  isDark,
  zoom,
  colors,
  onPointerDown,
}: UnitShapeProps) {
  const baseFill = showImage ? 0.16 : isDimmed ? 0.12 : 0.55;
  const hiFill = showImage ? 0.32 : isDimmed ? 0.28 : 0.72;
  const fillOpacity = isSelected ? hiFill : baseFill;
  const stroke = isSelected ? selectionStrokeColor() : colors.stroke;
  const fill = hexToRgba(stroke, fillOpacity);
  const labelFill = showImage ? stroke : isDark ? '#ffffff' : '#0b2942';
  const labelHalo = showImage ? (isDark ? '#0b0f17' : '#ffffff') : '#0b3a66';

  return (
    <g>
      <polygon
        points={rectPointsAttr(unit.bounds, unit.rotationRad)}
        fill={fill}
        stroke={stroke}
        strokeWidth={isSelected ? 2.5 / zoom : 1.5 / zoom}
        style={{ cursor: 'pointer' }}
        onPointerDown={(e) => onPointerDown(e, unit.id)}
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

export const ImportedLayoutViewer = forwardRef<ImportedLayoutViewerHandle, ImportedLayoutViewerProps>(
  function ImportedLayoutViewer(props, ref) {
    const {
      imageWidth,
      imageHeight,
      units,
      imageUrl,
      showImage = false,
      showLabels = true,
      selectedIds = EMPTY_SELECTED,
      hoveredId,
      getUnitColor,
      isUnitDimmed,
      onSelect,
      className,
    } = props;

    const { effectiveTheme } = useTheme();
    const isDark = effectiveTheme === 'dark';

    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const contentRef = useRef<SVGGElement>(null);

    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const drag = useRef<{ pointerId: number; startClient: { x: number; y: number }; startPan: { x: number; y: number } } | null>(null);
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const panRef = useRef(pan);
    panRef.current = pan;
    const animRef = useRef<number | null>(null);
    const unitsRef = useRef(units);
    unitsRef.current = units;
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const didInteract = useRef(false);

    const cancelAnim = useCallback(() => {
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    }, []);

    useEffect(() => () => cancelAnim(), [cancelAnim]);

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

    const fit = useCallback(() => {
      const el = containerRef.current;
      if (!el || !imageWidth || !imageHeight) return;
      const { clientWidth: cw, clientHeight: ch } = el;
      if (!cw || !ch) return;
      const z = Math.min(cw / imageWidth, ch / imageHeight) * 0.95;
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      setZoom(clamped);
      setPan({
        x: (cw - imageWidth * clamped) / 2,
        y: (ch - imageHeight * clamped) / 2,
      });
    }, [imageWidth, imageHeight]);

    const zoomAt = useCallback((factor: number, px: number, py: number) => {
      didInteract.current = true;
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

    const focusUnitById = useCallback(
      (unitId: string) => {
        const unit = unitsRef.current.find((u) => u.id === unitId);
        if (!unit) return;
        const el = containerRef.current;
        if (!el) return;
        const { clientWidth: cw, clientHeight: ch } = el;
        if (!cw || !ch) return;
        const box = aabb(unit.bounds, unit.rotationRad);
        const pad = 1.8;
        const fitZoom = Math.min(cw / (box.width * pad), ch / (box.height * pad));
        const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(fitZoom, 6)));
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
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
        focusUnit: focusUnitById,
      }),
      [fit, focusUnitById, zoomAtCenter]
    );

    useLayoutEffect(() => {
      didInteract.current = false;
      fit();
    }, [fit, imageWidth, imageHeight]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        if (!didInteract.current) fit();
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, [fit]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        cancelAnim();
        const rect = el.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
      };

      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }, [cancelAnim, zoomAt]);

    useEffect(() => {
      const onMove = (e: PointerEvent) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        setPan({
          x: d.startPan.x + (e.clientX - d.startClient.x),
          y: d.startPan.y + (e.clientY - d.startClient.y),
        });
      };
      const onUp = (e: PointerEvent) => {
        if (drag.current?.pointerId === e.pointerId) {
          drag.current = null;
          setIsDragging(false);
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
    }, []);

    const handleBackgroundDown = (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      didInteract.current = true;
      cancelAnim();
      drag.current = {
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        startPan: { ...panRef.current },
      };
      setIsDragging(true);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      onSelectRef.current?.(null);
    };

    const handleUnitDown = (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      cancelAnim();
      onSelectRef.current?.(id);
    };

    const defaultColor = overlayColor(false, 0.55);

    return (
      <div
        ref={containerRef}
        className={`relative h-full w-full overflow-hidden select-none ${className ?? ''} ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${isDark ? 'bg-gray-950' : 'bg-slate-100'}`}
      >
        <svg ref={svgRef} className="absolute inset-0 h-full w-full">
          <g ref={contentRef} transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <rect
              x={0}
              y={0}
              width={imageWidth}
              height={imageHeight}
              fill="transparent"
              onPointerDown={handleBackgroundDown}
            />
            {showImage && imageUrl && (
              <image href={imageUrl} x={0} y={0} width={imageWidth} height={imageHeight} />
            )}
            {units.map((unit) => {
              const colors = getUnitColor?.(unit.id) ?? defaultColor;
              const dimmed = isUnitDimmed?.(unit.id) ?? false;
              return (
                <UnitShape
                  key={unit.id}
                  unit={unit}
                  isSelected={selectedIds.has(unit.id) || unit.id === hoveredId}
                  isDimmed={dimmed}
                  showImage={showImage}
                  showLabels={showLabels}
                  isDark={isDark}
                  zoom={zoom}
                  colors={colors}
                  onPointerDown={handleUnitDown}
                />
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-2 right-2 flex gap-1">
          <ToolbarBtn title="Zoom in" onClick={() => zoomAtCenter(1.2)}>
            <MagnifyingGlassPlusIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Zoom out" onClick={() => zoomAtCenter(1 / 1.2)}>
            <MagnifyingGlassMinusIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Fit facility" onClick={() => { didInteract.current = false; fit(); }}>
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </ToolbarBtn>
        </div>
      </div>
    );
  }
);

const ToolbarBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({
  title,
  onClick,
  children,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 shadow-md border backdrop-blur-sm transition-colors ${
        isDark
          ? 'bg-gray-900/90 border-gray-700 text-gray-200 hover:bg-gray-800'
          : 'bg-white/90 border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
};

export default ImportedLayoutViewer;
