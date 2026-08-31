/**
 * Regression: tower / snake numbering block (units 49–66 in GT fixture).
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

function toEditable(
  u: { bounds: EditableUnit['bounds']; rotationRad: number; label?: string },
  id: string
): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { ...u.bounds },
    rotationRad: u.rotationRad,
    label: u.label,
    labelConfidence: 0.85,
    detectionConfidence: 0.9,
    manual: false,
    edited: false,
  };
}

function loadTowerBlock(): EditableUnit[] {
  const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8')) as {
    units: { bounds: EditableUnit['bounds']; rotationRad: number; label?: string }[];
  };
  const labels = new Set([
    '49', '50', '51', '52', '53', '54', '55', '56', '57',
    '58', '59', '60', '61', '62', '63', '64', '65', '66',
    '67', '68',
  ]);
  return gt.units
    .filter((u) => u.label && labels.has(u.label))
    .map((u, i) => toEditable(u, `gt-${u.label}-${i}`));
}

function duplicates(units: EditableUnit[]): string[] {
  const seen = new Map<string, number>();
  for (const u of units) {
    const l = (u.label ?? '').trim();
    if (!l) continue;
    seen.set(l, (seen.get(l) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([l]) => l);
}

describe('tower block label resolution', () => {
  it('discovers local row chains without merging tower cells into the base row', () => {
    const { rows } = discoverSpatialChains(loadTowerBlock());
    expect(rows.every((r) => !(r.some((u) => u.label === '49') && r.some((u) => u.label === '50')))).toBe(
      true
    );
    expect(rows.some((r) => r.some((u) => u.label === '49') && r.some((u) => u.label === '58'))).toBe(
      true
    );
  });

  it('resolves duplicate OCR labels in snake tower layout', () => {
    const base = loadTowerBlock();
    const withDupes = base.map((u) => {
      if (u.label === '54') return { ...u, id: `${u.id}-dup`, label: '53' };
      if (u.label === '55') return { ...u, id: `${u.id}-dup`, label: '54' };
      if (u.label === '64') return { ...u, id: `${u.id}-dup`, label: '63' };
      return u;
    });

    expect(duplicates(withDupes).length).toBeGreaterThan(0);

    const out = resolveLabelsFromNeighbors(withDupes, 5);
    expect(duplicates(out)).toEqual([]);
    const labels = out.map((u) => u.label).filter(Boolean).sort();
    expect(labels).toEqual(
      [...labels].filter((_, i, a) => a.indexOf(labels[i]) === i).sort()
    );
    expect(labels).toContain('54');
    expect(labels).toContain('64');
    expect(labels.filter((l) => l === '53')).toHaveLength(1);
    expect(labels.filter((l) => l === '63')).toHaveLength(1);
  });
});
