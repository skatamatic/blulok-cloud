/**
 * Regression: row start units 1–9 — missing unit 1 and swapped 2/3 OCR labels.
 */

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

const ROW_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function loadRowBlock(): EditableUnit[] {
  const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8'));
  return gt.units
    .filter((u: { label?: string }) => u.label && ROW_LABELS.includes(u.label))
    .map(
      (
        u: { bounds: EditableUnit['bounds']; rotationRad: number; label?: string },
        i: number
      ): EditableUnit => ({
        id: `g-${u.label}-${i}`,
        kind: 'unit',
        bounds: { ...u.bounds },
        rotationRad: u.rotationRad,
        label: u.label,
        labelConfidence: 0.85,
        detectionConfidence: 0.9,
        manual: false,
        edited: false,
      })
    );
}

describe('row 1–9 label resolution', () => {
  it('fills missing unit 1 and corrects swapped 2/3 at row start', () => {
    const base = loadRowBlock();
    const broken = base.map((u) => {
      if (u.label === '1') return { ...u, label: undefined, labelConfidence: 0 };
      if (u.label === '2') return { ...u, label: '3', labelConfidence: 0.7 };
      if (u.label === '3') return { ...u, label: '2', labelConfidence: 0.7 };
      return u;
    });

    const { rows } = discoverSpatialChains(broken);
    expect(rows.some((r) => r.length >= 5)).toBe(true);

    const out = resolveLabelsFromNeighbors(broken, 8);

    const byLabel = (l: string) => out.find((u) => u.label === l);
    expect(byLabel('1')).toBeDefined();
    expect(out.filter((u) => !u.label)).toEqual([]);
    expect(out.map((u) => u.label).filter(Boolean).sort()).toEqual([...ROW_LABELS].sort());

    // Units stay in spatial order left-to-right
    const sorted = [...out].sort((a, b) => a.bounds.cx - b.bounds.cx);
    expect(sorted.map((u) => u.label)).toEqual(ROW_LABELS);
  });
});
