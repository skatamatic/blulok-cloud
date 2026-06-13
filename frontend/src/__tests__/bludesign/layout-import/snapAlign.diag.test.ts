/**
 * Snap-align diagnostic against ground-truth fixture clusters.
 * Run: npm test -- snapAlign.diag.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { clusterRows, clusterColumns } from '@/components/bludesign/layout-import/labelResolution';
import { snapAlignUnits } from '@/components/bludesign/layout-import/snapAlign';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

const GT_PATH = path.join(
  __dirname,
  '../../../../../backend/src/bludesign/layout-import/__tests__/fixtures/ground-truth.json'
);

interface GtUnit {
  bounds: EditableUnit['bounds'];
  rotationRad: number;
  label?: string;
}

function toEditable(u: GtUnit, id: string): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { ...u.bounds },
    rotationRad: u.rotationRad,
    label: u.label,
    labelConfidence: 1,
    detectionConfidence: 1,
    manual: false,
    edited: false,
  };
}

function rowPerpSpread(units: EditableUnit[]): number {
  if (units.length < 2) return 0;
  const sorted = [...units].sort(
    (a, b) => parseInt(a.label || '0', 10) - parseInt(b.label || '0', 10)
  );
  const first = sorted[0].bounds;
  const last = sorted[sorted.length - 1].bounds;
  const dx = last.cx - first.cx;
  const dy = last.cy - first.cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const perps = sorted.map((u) => {
    const vx = u.bounds.cx - first.cx;
    const vy = u.bounds.cy - first.cy;
    return vx * nx + vy * ny;
  });
  return Math.max(...perps) - Math.min(...perps);
}

function rotSpreadDeg(units: EditableUnit[]): number {
  const rads = units.map((u) => u.rotationRad);
  return (Math.max(...rads) - Math.min(...rads)) * (180 / Math.PI);
}

interface ClusterReport {
  perpBefore: number;
  perpAfter: number;
  rotBefore: number;
  rotAfter: number;
  regressed: boolean;
}

function measureCluster(before: EditableUnit[], after: EditableUnit[]): ClusterReport {
  const perpBefore = rowPerpSpread(before);
  const perpAfter = rowPerpSpread(after);
  const rotBefore = rotSpreadDeg(before);
  const rotAfter = rotSpreadDeg(after);
  const perpDelta = perpAfter - perpBefore;
  const rotDelta = rotAfter - rotBefore;
  const regressed = perpDelta > 0.5 || rotDelta > 0.5;
  return { perpBefore, perpAfter, rotBefore, rotAfter, regressed };
}

describe('snapAlign diagnostic (ground truth fixture)', () => {
  const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8')) as { units: GtUnit[] };
  const all = gt.units.filter((u) => u.label).map((u, i) => toEditable(u, `gt-${i}`));

  it('logs cluster metrics before/after (see console)', () => {
    const rows = clusterRows(all);
    const cols = clusterColumns(all);
    console.log('\n[diag] rows:', rows.length, 'max row size:', Math.max(...rows.map((r) => r.length)));
    console.log('[diag] cols:', cols.length, 'max col size:', Math.max(...cols.map((c) => c.length)));

    const badCol = cols.find((c) => c.length > 5 && c.every((u) => {
      const n = parseInt(u.label || '0', 10);
      return n >= 1 && n <= 10;
    }));
    if (badCol) {
      console.log('[diag] BUG: col cluster merged row neighbors:', badCol.map((u) => u.label).join(','));
    }

    const aligned = snapAlignUnits(all);
    const clusters = [
      { name: '1-10', labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
      { name: '11-12', labels: ['11', '12'] },
      { name: '13-16', labels: ['13', '14', '15', '16'] },
    ];

    for (const c of clusters) {
      const before = all.filter((u) => c.labels.includes(u.label!));
      const after = aligned.filter((u) => c.labels.includes(u.label!));
      const m = measureCluster(before, after);
      console.log(
        `[diag] ${c.name}: perp ${m.perpBefore.toFixed(2)}→${m.perpAfter.toFixed(2)}, rot ${m.rotBefore.toFixed(2)}°→${m.rotAfter.toFixed(2)}° ${m.regressed ? 'REGRESSION' : 'ok'}`
      );
    }
  });

  it('does not regress the 1-10 locker row', () => {
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const before = all.filter((u) => labels.includes(u.label!));
    const after = snapAlignUnits(before);
    const m = measureCluster(before, after);
    expect(m.regressed).toBe(false);
    expect(m.perpAfter).toBeLessThanOrEqual(m.perpBefore + 0.01);
  });

  it('does not regress cluster 13-16', () => {
    const labels = ['13', '14', '15', '16'];
    const before = all.filter((u) => labels.includes(u.label!));
    const after = snapAlignUnits(before);
    const m = measureCluster(before, after);
    expect(m.regressed).toBe(false);
  });

  it('improves perpendicular jitter on row 1-10 without full-fixture regression', () => {
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const before = all.filter((u) => labels.includes(u.label!));

    const isolated = snapAlignUnits(before);
    const mIso = measureCluster(before, isolated);
    expect(mIso.perpAfter).toBeLessThan(mIso.perpBefore);

    const fromFull = snapAlignUnits(all).filter((u) => labels.includes(u.label!));
    const mFull = measureCluster(before, fromFull);
    expect(mFull.regressed).toBe(false);
    expect(mFull.perpAfter).toBeLessThanOrEqual(mFull.perpBefore + 0.05);
  });
});
