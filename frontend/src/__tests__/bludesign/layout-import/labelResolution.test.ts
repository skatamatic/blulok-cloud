/**
 * Tests for neighbor-based label auto-resolution.
 */

import {
  parseNumericLabel,
  resolveLabelsFromNeighbors,
  clusterRows,
  clusterColumns,
  isDigitTransposition,
} from '@/components/bludesign/layout-import/labelResolution';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

function unit(id: string, cx: number, cy = 100, label?: string): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { cx, cy, width: 40, height: 80 },
    rotationRad: 0,
    label,
    labelConfidence: label ? 0.9 : 0,
    detectionConfidence: 0.9,
  };
}

function sizedUnit(
  id: string,
  cx: number,
  cy: number,
  width: number,
  height: number,
  rotationRad: number,
  label?: string
): EditableUnit {
  return {
    id,
    kind: 'unit',
    bounds: { cx, cy, width, height },
    rotationRad,
    label,
    labelConfidence: label ? 0.9 : 0,
    detectionConfidence: 0.9,
  };
}

describe('parseNumericLabel', () => {
  it('parses number and suffix', () => {
    expect(parseNumericLabel('72a')).toEqual({ num: 72, suffix: 'a', text: '72a' });
    expect(parseNumericLabel('71')).toEqual({ num: 71, suffix: '', text: '71' });
  });
});

describe('isDigitTransposition', () => {
  it('detects reversed digit pairs', () => {
    expect(isDigitTransposition(13, 31)).toBe(true);
    expect(isDigitTransposition(31, 13)).toBe(true);
    expect(isDigitTransposition(2, 71)).toBe(false);
  });
});

describe('clusterRows', () => {
  it('groups units with similar center-y', () => {
    const rows = clusterRows([
      unit('a', 10, 100, '1'),
      unit('b', 30, 100, '2'),
      unit('c', 10, 200, '3'),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2);
  });
});

describe('clusterColumns', () => {
  it('groups units with similar center-x', () => {
    const cols = clusterColumns([
      unit('a', 100, 10, '1'),
      unit('b', 100, 50, '2'),
      unit('c', 200, 10, '3'),
    ]);
    expect(cols).toHaveLength(2);
    expect(cols[0]).toHaveLength(2);
  });
});

describe('resolveLabelsFromNeighbors', () => {
  it('fills a gap between 71 and 73 with 72', () => {
    const out = resolveLabelsFromNeighbors([
      unit('a', 0, 100, '71'),
      unit('b', 50, 100),
      unit('c', 100, 100, '73'),
    ]);
    expect(out.find((u) => u.id === 'b')?.label).toBe('72');
  });

  it('corrects OCR "2" sandwiched between 70 and 72 to 71', () => {
    const out = resolveLabelsFromNeighbors([
      unit('a', 0, 100, '70'),
      unit('b', 50, 100, '2'),
      unit('c', 100, 100, '72'),
      unit('d', 150, 100, '73'),
    ]);
    expect(out.find((u) => u.id === 'b')?.label).toBe('71');
  });

  it('corrects transposed "13" to 31 between 30 and 38', () => {
    const out = resolveLabelsFromNeighbors([
      unit('a', 0, 200, '30'),
      unit('b', 50, 200, '13'),
      unit('c', 100, 200, '38'),
    ]);
    expect(out.find((u) => u.id === 'b')?.label).toBe('31');
  });

  it('corrects corner cell 43 to 49 from left 48 and above 50', () => {
    const out = resolveLabelsFromNeighbors([
      unit('left', 0, 100, '48'),
      unit('top', 50, 60, '50'),
      unit('corner', 50, 100, '43'),
    ]);
    expect(out.find((u) => u.id === 'corner')?.label).toBe('49');
  });

  it('clears a duplicate that does not fit the sequence and fills on a later pass', () => {
    const out = resolveLabelsFromNeighbors([
      unit('a', 0, 100, '70'),
      unit('b', 50, 100, '71'),
      unit('c', 100, 100, '71'),
      unit('d', 150, 100, '73'),
    ], 3);
    const labels = out.map((u) => u.label).filter(Boolean);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('71');
    expect(labels).toContain('72');
    expect(labels).toContain('73');
  });

  it('corrects swapped adjacent labels 3,2 to 2,3 and fills leading gap', () => {
    const out = resolveLabelsFromNeighbors([
      unit('a', 0, 100),
      unit('b', 50, 100, '3'),
      unit('c', 100, 100, '2'),
      unit('d', 150, 100, '4'),
      unit('e', 200, 100, '5'),
    ], 5);
    const sorted = [...out].sort((a, b) => a.bounds.cx - b.bounds.cx);
    expect(sorted.map((u) => u.label)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('fills branch corner 113 and column top 116 in L-shaped row', () => {
    const out = resolveLabelsFromNeighbors(
      [
        sizedUnit('u116', 100, 100, 30, 20, -0.26),
        sizedUnit('u115', 107, 125, 30, 30, 1.33, '115'),
        sizedUnit('u114', 114, 150, 30, 25, -0.24, '114'),
        sizedUnit('u113', 137, 118, 38, 30, 1.32),
        sizedUnit('u112', 167, 110, 76, 30, 1.32, '112'),
      ],
      5
    );
    expect(out.find((u) => u.id === 'u113')?.label).toBe('113');
    expect(out.find((u) => u.id === 'u116')?.label).toBe('116');
  });
});
