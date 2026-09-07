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

describe('tower sim', () => {
  it('writes debug', () => {
    const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8'));
    const labels = new Set([
      '49','50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','67',
    ]);
    const base: EditableUnit[] = gt.units
      .filter((u: { label?: string }) => u.label && labels.has(u.label))
      .map((u: { bounds: EditableUnit['bounds']; rotationRad: number; label?: string }, i: number) => ({
        id: `g-${u.label}-${i}`,
        kind: 'unit' as const,
        bounds: { ...u.bounds },
        rotationRad: u.rotationRad,
        label: u.label,
        labelConfidence: 0.85,
        detectionConfidence: 0.9,
        manual: false,
        edited: false,
      }));

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
        .map((u) => `${u.label ?? 'RED'} was ${u.id}`),
      'MISSING:',
      ...['49','50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','67'].filter(
        (l) => !out.some((u) => u.label === l)
      ),
    ];
    fs.writeFileSync(path.join(__dirname, '../../../../../backend/_label-tower2-debug.txt'), lines.join('\n'));

    const expected = ['49','50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','67'];
    expect(out.filter((u) => !u.label).map((u) => u.id)).toEqual([]);
    expect(out.map((u) => u.label).filter(Boolean).sort()).toEqual(expected.sort());
  });
});
