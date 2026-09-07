/**
 * Tests for the Build-in-3D wizard name-matching helpers.
 */

import {
  autoMatch,
  levenshtein,
  normalizeLabel,
  scoreMatch,
} from '@/components/bludesign/layout-import/build-wizard/nameMatch';

describe('normalizeLabel', () => {
  it('splits number and optional suffix', () => {
    expect(normalizeLabel('Unit 204a')).toMatchObject({ num: 204, suffix: 'a', key: '204a' });
    expect(normalizeLabel('204')).toMatchObject({ num: 204, suffix: '', key: '204' });
    expect(normalizeLabel('B-12 C')).toMatchObject({ num: 12, suffix: 'c', key: '12c' });
  });

  it('handles non-numeric labels', () => {
    expect(normalizeLabel('Office')).toMatchObject({ num: null, key: 'office' });
  });
});

describe('levenshtein', () => {
  it('measures edit distance', () => {
    expect(levenshtein('204a', '204a')).toBe(0);
    expect(levenshtein('204', '204a')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('scoreMatch', () => {
  it('scores exact keys as 1', () => {
    expect(scoreMatch(normalizeLabel('204a'), normalizeLabel('204a'))).toBe(1);
  });

  it('scores same-number different-suffix as 0.85', () => {
    expect(scoreMatch(normalizeLabel('204'), normalizeLabel('204a'))).toBe(0.85);
  });

  it('falls back to fuzzy similarity', () => {
    const s = scoreMatch(normalizeLabel('204a'), normalizeLabel('205b'));
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.85);
  });
});

describe('autoMatch', () => {
  it('matches 204a to 204a exactly and 204 to 204a by number', () => {
    const diagram = [
      { id: 'd1', label: 'Unit 204a' },
      { id: 'd2', label: 'Unit 205' },
    ];
    const units = [
      { id: 'u1', unit_number: '204a' },
      { id: 'u2', unit_number: '205b' },
    ];
    const { assignments } = autoMatch(diagram, units);
    expect(assignments.d1).toBe('u1');
    expect(assignments.d2).toBe('u2'); // 205 -> 205b (same number)
  });

  it('keeps assignment one-to-one', () => {
    const diagram = [
      { id: 'd1', label: '204' },
      { id: 'd2', label: '204' },
    ];
    const units = [{ id: 'u1', unit_number: '204' }];
    const { assignments } = autoMatch(diagram, units);
    const bound = [assignments.d1, assignments.d2].filter(Boolean);
    expect(bound).toHaveLength(1); // only one diagram unit can claim u1
  });

  it('leaves units unmatched below the threshold', () => {
    const diagram = [{ id: 'd1', label: 'Office' }];
    const units = [{ id: 'u1', unit_number: '999' }];
    const { assignments } = autoMatch(diagram, units, { threshold: 0.6 });
    expect(assignments.d1).toBeNull();
  });

  it('provides ranked candidates for manual override', () => {
    const diagram = [{ id: 'd1', label: '204' }];
    const units = [
      { id: 'u1', unit_number: '999' },
      { id: 'u2', unit_number: '204' },
    ];
    const { candidates } = autoMatch(diagram, units);
    expect(candidates.d1[0].unitId).toBe('u2'); // best first
  });
});
