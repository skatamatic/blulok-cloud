import * as fs from 'fs';
import * as path from 'path';
import {
  discoverSpatialChains,
  resolveLabelsFromNeighbors,
} from '@/components/bludesign/layout-import/labelResolution';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

const GT_PATH = path.join(
  __dirname,
  '../../../../../backend/src/bludesign/layout-import/__tests__/fixtures/ground-truth.json'
);

function toEditable(u: any, id: string): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { ...u.bounds },
    rotationRad: u.rotationRad,
    label: u.label,
    labelConfidence: u.label ? 0.85 : 0,
    detectionConfidence: 0.9,
    manual: false,
    edited: false,
  };
}

const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8'));
const labels = new Set([
  '49','50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','67',
]);
const base = gt.units
  .filter((u: any) => u.label && labels.has(u.label))
  .map((u: any, i: number) => toEditable(u, `g-${u.label}-${i}`));

// Simulate screenshot: missing labels on key snake cells
const broken = base.map((u) => {
  if (['57', '56', '54', '65'].includes(u.label!)) return { ...u, label: undefined, labelConfidence: 0 };
  return u;
});

const { rows, cols } = discoverSpatialChains(broken);
const out = resolveLabelsFromNeighbors(broken, 8);

const lines = [
  'ROWS:',
  ...rows.map((r) => r.map((u) => u.label ?? '?').join(',')),
  'COLS:',
  ...cols.map((c) => c.map((u) => u.label ?? '?').join(',')),
  'OUT:',
  ...out
    .sort((a, b) => a.bounds.cx - b.bounds.cx || a.bounds.cy - b.bounds.cy)
    .map((u) => `${u.label ?? 'RED'} @ ${u.bounds.cx.toFixed(0)},${u.bounds.cy.toFixed(0)} (was ${u.id.split('-')[1]})`),
  'MISSING:',
  ...['49','50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','67'].filter(
    (l) => !out.some((u) => u.label === l)
  ),
  'UNLABELED:',
  ...out.filter((u) => !u.label).map((u) => u.id),
];
fs.writeFileSync(path.join(__dirname, '../../../../../backend/_label-tower2-debug.txt'), lines.join('\n'));
