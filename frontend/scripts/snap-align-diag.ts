/**
 * Snap-align diagnostic: measure cluster quality before/after on the test fixture.
 * Run: npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/snap-align-diag.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { clusterRows, clusterColumns } from '../src/components/bludesign/layout-import/labelResolution';
import { snapAlignUnits } from '../src/components/bludesign/layout-import/snapAlign';
import type { EditableUnit } from '../src/components/bludesign/layout-import/types';

const GT_PATH = path.join(
  __dirname,
  '../../backend/src/bludesign/layout-import/__tests__/fixtures/ground-truth.json'
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

/** Perpendicular offset of center from the line through first→last unit in label order. */
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

/** Max gap/overlap between adjacent units sorted by cx (world axis). */
function maxAdjacentEdgeError(units: EditableUnit[]): number {
  const sorted = [...units].sort((a, b) => a.bounds.cx - b.bounds.cx);
  let maxErr = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const dist = Math.hypot(b.bounds.cx - a.bounds.cx, b.bounds.cy - a.bounds.cy);
    const expected = (a.bounds.width + b.bounds.width) / 2;
    maxErr = Math.max(maxErr, Math.abs(dist - expected));
  }
  return maxErr;
}

function reportCluster(name: string, before: EditableUnit[], after: EditableUnit[]) {
  const perpBefore = rowPerpSpread(before);
  const perpAfter = rowPerpSpread(after);
  const rotBefore = rotSpreadDeg(before);
  const rotAfter = rotSpreadDeg(after);
  const edgeBefore = maxAdjacentEdgeError(before);
  const edgeAfter = maxAdjacentEdgeError(after);

  const perpDelta = perpAfter - perpBefore;
  const rotDelta = rotAfter - rotBefore;
  const edgeDelta = edgeAfter - edgeBefore;

  const improved = perpDelta < -0.1 || (rotDelta < -0.01 && perpDelta <= 0.5);
  const regressed = perpDelta > 0.5 || rotDelta > 0.5 || edgeDelta > 5;

  console.log(`\n=== ${name} (${before.length} units) ===`);
  console.log(
    `  Perp spread: ${perpBefore.toFixed(2)} → ${perpAfter.toFixed(2)} px (${perpDelta >= 0 ? '+' : ''}${perpDelta.toFixed(2)})`
  );
  console.log(
    `  Rot spread:  ${rotBefore.toFixed(2)}° → ${rotAfter.toFixed(2)}° (${rotDelta >= 0 ? '+' : ''}${rotDelta.toFixed(2)}°)`
  );
  console.log(
    `  Edge error:  ${edgeBefore.toFixed(2)} → ${edgeAfter.toFixed(2)} px (${edgeDelta >= 0 ? '+' : ''}${edgeDelta.toFixed(2)})`
  );
  console.log(`  Verdict: ${regressed ? 'REGRESSION' : improved ? 'IMPROVED' : 'NEUTRAL'}`);

  return { perpDelta, rotDelta, edgeDelta, regressed, improved };
}

function main() {
  const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8')) as { units: GtUnit[] };
  const all = gt.units
    .filter((u) => u.label)
    .map((u, i) => toEditable(u, `gt-${i}`));

  const rows = clusterRows(all);
  const cols = clusterColumns(all);
  console.log('Global clusterRows count:', rows.length, 'largest:', Math.max(...rows.map((r) => r.length)));
  console.log('Global clusterColumns count:', cols.length, 'largest:', Math.max(...cols.map((c) => c.length)));

  // Problem clusters from user screenshot
  const clusterDefs: { name: string; labels: string[] }[] = [
    { name: 'Row 1-10 (vertical lockers)', labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
    { name: 'Row 11-12', labels: ['11', '12'] },
    { name: 'Cluster 13-16', labels: ['13', '14', '15', '16'] },
    { name: 'Full fixture', labels: all.map((u) => u.label!).filter(Boolean) },
  ];

  const aligned = snapAlignUnits(all);
  let regressions = 0;
  let improvements = 0;

  for (const def of clusterDefs) {
    const before = all.filter((u) => def.labels.includes(u.label!));
    const after = aligned.filter((u) => def.labels.includes(u.label!));
    const r = reportCluster(def.name, before, after);
    if (r.regressed) regressions++;
    if (r.improved) improvements++;
  }

  // Detail units 1-10
  console.log('\n--- Units 1-10 detail ---');
  for (const l of ['1', '2', '5', '10']) {
    const b = all.find((u) => u.label === l)!;
    const a = aligned.find((u) => u.label === l)!;
    console.log(
      `${l}: cx ${b.bounds.cx.toFixed(1)}→${a.bounds.cx.toFixed(1)}, cy ${b.bounds.cy.toFixed(1)}→${a.bounds.cy.toFixed(1)}, rot ${((b.rotationRad * 180) / Math.PI).toFixed(2)}→${((a.rotationRad * 180) / Math.PI).toFixed(2)}°`
    );
  }

  console.log(`\nSummary: ${improvements} improved, ${regressions} regressed`);
}

main();
