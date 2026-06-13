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

const ROW_LABELS = ['106', '107', '108', '109', '110', '111', '112', '113', '114', '115', '116'];

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

describe('row 106–116 label resolution', () => {
  it('fills missing OCR labels in rotated row with vertical stack at start', () => {
    const base = loadRowBlock();
    const broken = base.map((u) => {
      if (['116', '111', '113', '107'].includes(u.label!)) {
        return { ...u, label: undefined, labelConfidence: 0 };
      }
      return u;
    });

    const { rows, cols } = discoverSpatialChains(broken);
    const out = resolveLabelsFromNeighbors(broken, 8);

    const debugPath = path.join(__dirname, '../../../../../backend/_label-row106-debug.txt');
    fs.writeFileSync(
      debugPath,
      [
        'ROWS:',
        ...rows.map((r) => r.map((u) => u.label ?? '?').join(',')),
        'COLS:',
        ...cols.map((c) => c.map((u) => u.label ?? '?').join(',')),
        'OUT:',
        ...out
          .sort((a, b) => a.bounds.cx - b.bounds.cx || a.bounds.cy - b.bounds.cy)
          .map((u) => `${u.label ?? 'RED'} @ cx=${u.bounds.cx.toFixed(0)} cy=${u.bounds.cy.toFixed(0)}`),
        'MISSING:',
        ...ROW_LABELS.filter((l) => !out.some((u) => u.label === l)),
      ].join('\n')
    );

    expect(out.filter((u) => !u.label).map((u) => u.id)).toEqual([]);
    expect(out.map((u) => u.label).filter(Boolean).sort()).toEqual([...ROW_LABELS].sort());
  });
});
