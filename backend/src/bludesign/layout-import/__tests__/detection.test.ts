/**
 * Fast, pure tests for the filtering + geometry-normalization layer and option
 * resolution. No OpenCV/image work, so these run in the default Jest suite.
 */

import {
  isInExcludedRegion,
  autoLegendRegion,
  aspectRatio,
  passesShapeFilters,
  nonMaxSuppression,
  applyFilters,
  hexSaturation,
  suppressContainers,
} from '../detection/filters';
import { normalizeMinAreaRect } from '../detection/detectRectangles';
import type { RawDetection } from '../detection/detectRectangles';
import {
  resolveDetectionOptions,
  DEFAULT_DETECTION_OPTIONS,
} from '../types';

function raw(
  cx: number,
  cy: number,
  w: number,
  h: number,
  fillRatio = 0.95,
  rot = 0,
  colorHex?: string
): RawDetection {
  return {
    bounds: { cx, cy, width: w, height: h },
    rotationRad: rot,
    fillRatio,
    areaPx: w * h * fillRatio,
    colorHex,
  };
}

describe('resolveDetectionOptions', () => {
  it('returns defaults when nothing supplied', () => {
    expect(resolveDetectionOptions()).toEqual(DEFAULT_DETECTION_OPTIONS);
  });

  it('overrides only provided keys', () => {
    const resolved = resolveDetectionOptions({ minAreaPx: 999, runOcr: false });
    expect(resolved.minAreaPx).toBe(999);
    expect(resolved.runOcr).toBe(false);
    expect(resolved.maxAspect).toBe(DEFAULT_DETECTION_OPTIONS.maxAspect);
  });

  it('defaults excludeRegions to an empty array', () => {
    expect(resolveDetectionOptions().excludeRegions).toEqual([]);
  });
});

describe('normalizeMinAreaRect', () => {
  it('keeps width as the longer axis and 0 angle when already wide', () => {
    const r = normalizeMinAreaRect({
      center: { x: 10, y: 20 },
      size: { width: 40, height: 10 },
      angle: 0,
    });
    expect(r.bounds).toEqual({ cx: 10, cy: 20, width: 40, height: 10 });
    expect(r.rotationRad).toBeCloseTo(0, 6);
  });

  it('swaps axes and rotates 90° when height is longer', () => {
    const r = normalizeMinAreaRect({
      center: { x: 0, y: 0 },
      size: { width: 10, height: 40 },
      angle: 0,
    });
    expect(r.bounds.width).toBe(40);
    expect(r.bounds.height).toBe(10);
    // 90° wraps to -90 → but our wrap keeps (-90, 90]; 90 stays 90.
    expect(Math.abs(r.rotationRad)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('wraps large angles into (-90, 90] degrees', () => {
    const r = normalizeMinAreaRect({
      center: { x: 0, y: 0 },
      size: { width: 40, height: 10 },
      angle: 170,
    });
    // 170 wraps to -10°.
    expect(r.rotationRad).toBeCloseTo((-10 * Math.PI) / 180, 6);
  });
});

describe('region exclusion', () => {
  it('autoLegendRegion covers the top-left band', () => {
    const region = autoLegendRegion(1000, 500);
    expect(region).toEqual({ x: 0, y: 0, width: 300, height: 90 });
  });

  it('detects centers inside an excluded region', () => {
    const region = [{ x: 0, y: 0, width: 100, height: 100 }];
    expect(isInExcludedRegion(raw(50, 50, 10, 10), region)).toBe(true);
    expect(isInExcludedRegion(raw(150, 50, 10, 10), region)).toBe(false);
  });
});

describe('shape filters', () => {
  const opts = resolveDetectionOptions();

  it('accepts a normal unit rectangle', () => {
    expect(passesShapeFilters(raw(500, 500, 40, 30), 1000, 1000, opts)).toBe(
      true
    );
  });

  it('rejects tiny dots (poles/bollards) below minAreaPx', () => {
    expect(passesShapeFilters(raw(500, 500, 6, 6), 1000, 1000, opts)).toBe(
      false
    );
  });

  it('rejects the huge site-boundary contour above maxAreaFraction', () => {
    expect(
      passesShapeFilters(raw(500, 500, 900, 900), 1000, 1000, opts)
    ).toBe(false);
  });

  it('rejects thin connector lines beyond maxAspect', () => {
    expect(passesShapeFilters(raw(500, 500, 400, 5, 0.95), 1000, 1000, opts)).toBe(
      false
    );
  });

  it('rejects ragged blobs below minRectFillRatio', () => {
    expect(passesShapeFilters(raw(500, 500, 40, 30, 0.3), 1000, 1000, opts)).toBe(
      false
    );
  });

  it('aspectRatio is always >= 1 regardless of orientation', () => {
    expect(aspectRatio(raw(0, 0, 40, 10))).toBeCloseTo(4, 6);
    expect(aspectRatio(raw(0, 0, 10, 40))).toBeCloseTo(4, 6);
  });

  it('rejects near-white/grey text regions via the colorfulness gate', () => {
    // The colorfulness gate is OFF by default (border model is fill-independent),
    // so opt into it explicitly for this 'color' fallback scenario.
    const colorOpts = resolveDetectionOptions({ minColorSaturation: 0.18 });
    // White fill (text-on-white legend/title) → saturation 0 → rejected.
    expect(
      passesShapeFilters(raw(500, 500, 40, 30, 0.95, 0, '#ffffff'), 1000, 1000, colorOpts)
    ).toBe(false);
    // Saturated unit fill → kept.
    expect(
      passesShapeFilters(raw(500, 500, 40, 30, 0.95, 0, '#147fd4'), 1000, 1000, colorOpts)
    ).toBe(true);
  });

  it('keeps grey/faint fills by default (gate disabled for the border model)', () => {
    // Light-grey cell that the old fill-threshold model missed → now kept.
    expect(
      passesShapeFilters(raw(500, 500, 40, 30, 0.95, 0, '#e5e5e5'), 1000, 1000, opts)
    ).toBe(true);
  });

  it('skips the colorfulness gate when no fill color was sampled', () => {
    const colorOpts = resolveDetectionOptions({ minColorSaturation: 0.18 });
    expect(
      passesShapeFilters(raw(500, 500, 40, 30, 0.95, 0, undefined), 1000, 1000, colorOpts)
    ).toBe(true);
  });
});

describe('hexSaturation', () => {
  it('is 0 for white, grey and black', () => {
    expect(hexSaturation('#ffffff')).toBe(0);
    expect(hexSaturation('#808080')).toBe(0);
    expect(hexSaturation('#000000')).toBe(0);
  });

  it('is high for vivid colors', () => {
    expect(hexSaturation('#ff0000')).toBeCloseTo(1, 6);
    expect(hexSaturation('#147fd4')).toBeGreaterThan(0.5);
  });

  it('is 0 for missing or malformed input', () => {
    expect(hexSaturation(undefined)).toBe(0);
    expect(hexSaturation('nope')).toBe(0);
  });
});

describe('suppressContainers', () => {
  it('drops a row blob enclosing >= 2 medium cells, keeping the cells', () => {
    const container = raw(100, 100, 120, 40, 0.95); // wide row blob
    const cellA = raw(70, 100, 30, 36, 0.95); // ~22% of container
    const cellB = raw(110, 100, 30, 36, 0.95);
    const kept = suppressContainers([container, cellA, cellB]);
    expect(kept).toHaveLength(2);
    expect(kept).not.toContain(container);
  });

  it('drops a cluster outline enclosing many small cells, keeping the cells', () => {
    const outline = raw(100, 100, 300, 100, 0.95);
    const cells = [
      raw(40, 90, 28, 24),
      raw(80, 90, 28, 24),
      raw(120, 90, 28, 24),
      raw(160, 90, 28, 24),
    ];
    const kept = suppressContainers([outline, ...cells]);
    expect(kept).toHaveLength(cells.length);
    expect(kept).not.toContain(outline);
  });

  it('keeps a cell and drops the small number glyph(s) inside it', () => {
    const cell = raw(100, 100, 60, 40, 0.95);
    const glyph = raw(100, 100, 16, 18, 0.95); // ~12% of the cell → a digit
    const kept = suppressContainers([cell, glyph]);
    expect(kept).toEqual([cell]);
  });

  it('keeps the inner of a near-concentric pair (innermost wins)', () => {
    const outer = raw(100, 100, 60, 40, 0.95);
    const inner = raw(100, 100, 52, 33, 0.95); // ~71% of outer → real inner ring
    const kept = suppressContainers([outer, inner]);
    expect(kept).toEqual([inner]);
  });
});

describe('nonMaxSuppression', () => {
  it('removes a near-duplicate overlapping box', () => {
    const a = raw(100, 100, 40, 30, 0.98);
    const b = raw(102, 101, 40, 30, 0.9); // heavily overlaps a
    const kept = nonMaxSuppression([a, b], 0.4);
    expect(kept).toHaveLength(1);
    expect(kept[0].fillRatio).toBe(0.98); // keeps the higher-quality one
  });

  it('keeps distinct non-overlapping boxes', () => {
    const a = raw(100, 100, 40, 30);
    const b = raw(300, 300, 40, 30);
    expect(nonMaxSuppression([a, b], 0.4)).toHaveLength(2);
  });
});

describe('applyFilters', () => {
  it('runs region → shape → NMS and reports warnings', () => {
    const legendDot = raw(10, 10, 8, 8); // inside legend, also tiny
    const goodA = raw(500, 500, 40, 30, 0.95);
    const goodADup = raw(501, 500, 40, 30, 0.9); // duplicate of goodA
    const lineNoise = raw(700, 700, 400, 4, 0.95); // too elongated
    const result = applyFilters(
      [legendDot, goodA, goodADup, lineNoise],
      1000,
      1000,
      resolveDetectionOptions()
    );
    expect(result.kept).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
