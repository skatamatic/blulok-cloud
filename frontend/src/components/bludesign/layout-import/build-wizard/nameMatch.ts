/**
 * Build-in-3D Wizard — Name-based unit matching (pure)
 *
 * Real BluLok units carry no coordinates, so diagram units are matched to real
 * units purely by label/unit-number string. We normalize each to a numeric core
 * plus an optional trailing letter (e.g. "Unit 204a" -> { num: 204, suffix: 'a' })
 * and rank candidates: exact > same-number > fuzzy (Levenshtein). Assignment is
 * greedy one-to-one above a confidence threshold.
 */

export interface NormalizedLabel {
  raw: string;
  num: number | null;
  suffix: string;
  /** Canonical comparison key, e.g. "204a". */
  key: string;
}

/** Normalize a raw label / unit number into a comparison form. */
export function normalizeLabel(raw: string): NormalizedLabel {
  const trimmed = (raw ?? '').trim();
  const match = trimmed.match(/(\d+)\s*([A-Za-z]?)/);
  if (match) {
    const num = parseInt(match[1], 10);
    const suffix = (match[2] || '').toLowerCase();
    return { raw: trimmed, num, suffix, key: `${num}${suffix}` };
  }
  return { raw: trimmed, num: null, suffix: '', key: trimmed.toLowerCase().replace(/\s+/g, '') };
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Score a diagram label against a candidate unit number in [0, 1].
 * 1 = exact key, 0.85 = same number (different/empty suffix), else fuzzy.
 */
export function scoreMatch(label: NormalizedLabel, unit: NormalizedLabel): number {
  if (label.key && label.key === unit.key) return 1;
  if (label.num !== null && unit.num !== null && label.num === unit.num) return 0.85;
  const maxLen = Math.max(label.key.length, unit.key.length, 1);
  return 1 - levenshtein(label.key, unit.key) / maxLen;
}

export interface MatchCandidate {
  unitId: string;
  unitNumber: string;
  score: number;
}

export interface DiagramEntry {
  id: string;
  label: string;
}

export interface RealUnitEntry {
  id: string;
  unit_number: string;
}

export interface AutoMatchResult {
  /** diagram unit id -> chosen real unit id (or null when below threshold). */
  assignments: Record<string, string | null>;
  /** diagram unit id -> all real units ranked best-first (for manual override). */
  candidates: Record<string, MatchCandidate[]>;
}

/**
 * Greedy one-to-one auto-match. Pairs are assigned highest-score first; each real
 * unit and diagram unit is used at most once. Diagram units without a label, or
 * whose best score is below `threshold`, are left unassigned.
 */
export function autoMatch(
  diagram: DiagramEntry[],
  units: RealUnitEntry[],
  options: { threshold?: number } = {}
): AutoMatchResult {
  const threshold = options.threshold ?? 0.6;
  const normalizedUnits = units.map((u) => ({ entry: u, norm: normalizeLabel(u.unit_number) }));

  const candidates: Record<string, MatchCandidate[]> = {};
  const assignments: Record<string, string | null> = {};

  type Pair = { diagramId: string; unitId: string; score: number };
  const pairs: Pair[] = [];

  for (const d of diagram) {
    assignments[d.id] = null;
    const labelNorm = normalizeLabel(d.label);
    const ranked: MatchCandidate[] = normalizedUnits
      .map(({ entry, norm }) => ({
        unitId: entry.id,
        unitNumber: entry.unit_number,
        score: labelNorm.key ? scoreMatch(labelNorm, norm) : 0,
      }))
      .sort((a, b) => b.score - a.score);
    candidates[d.id] = ranked;
    if (labelNorm.key) {
      for (const c of ranked) {
        if (c.score >= threshold) pairs.push({ diagramId: d.id, unitId: c.unitId, score: c.score });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  const usedUnits = new Set<string>();
  const usedDiagram = new Set<string>();
  for (const p of pairs) {
    if (usedDiagram.has(p.diagramId) || usedUnits.has(p.unitId)) continue;
    assignments[p.diagramId] = p.unitId;
    usedDiagram.add(p.diagramId);
    usedUnits.add(p.unitId);
  }

  return { assignments, candidates };
}
