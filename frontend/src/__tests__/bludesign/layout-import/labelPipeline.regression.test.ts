/**
 * End-to-end LABEL regression: real detector output → the full frontend
 * post-processing pipeline (strip untrusted → ingest filter → dedupe →
 * neighbor resolution → snap → doors) → compared against hand-verified
 * ground-truth labels.
 *
 * This guards the seam the backend OCR regression cannot see: the backend can
 * read every label correctly and the frontend can still destroy them (e.g.
 * correct reads reported with 0.00 engine confidence were stripped as
 * untrusted, then neighbor resolution invented wrong fills for the now-empty
 * cells). Fixtures are committed snapshots:
 *  - detection-result.json — the engine's actual output on the sample plan
 *  - ground-truth.json     — same geometry with vision-verified labels
 */

import * as fs from 'fs';
import * as path from 'path';
import { postProcessImportedUnits } from '@/components/bludesign/layout-import/postProcess';
import type {
  DetectedUnitCandidate,
  EditableUnit,
} from '@/components/bludesign/layout-import/types';

const FIXTURES = path.join(
  __dirname,
  '../../../../../backend/src/bludesign/layout-import/__tests__/fixtures'
);

interface FixtureUnit {
  bounds: EditableUnit['bounds'];
  rotationRad: number;
  label?: string;
}

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T;
}

function toEditable(u: DetectedUnitCandidate): EditableUnit {
  return { ...u, manual: false, edited: false };
}

/** Match output units to truth cells by center containment / proximity. */
function truthLabelAt(
  truth: FixtureUnit[],
  unit: EditableUnit
): string | undefined {
  let best: FixtureUnit | null = null;
  let bestDist = Infinity;
  for (const t of truth) {
    const d = Math.hypot(t.bounds.cx - unit.bounds.cx, t.bounds.cy - unit.bounds.cy);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  // Snap alignment moves centers by at most a fraction of the short side.
  if (!best || bestDist > Math.min(best.bounds.width, best.bounds.height)) {
    return undefined;
  }
  return best.label;
}

describe('frontend label pipeline vs ground truth', () => {
  it('preserves / repairs labels end-to-end on the sample plan', () => {
    const result = loadJson<{
      imageWidth: number;
      imageHeight: number;
      units: DetectedUnitCandidate[];
    }>('detection-result.json');
    const truth = loadJson<{ units: FixtureUnit[] }>('ground-truth.json');

    const out = postProcessImportedUnits(
      result.units.map(toEditable),
      result.imageWidth,
      result.imageHeight
    );

    // The pipeline must not lose cells the detector emitted.
    expect(out.length).toBe(result.units.length);

    let evaluated = 0;
    let correct = 0;
    const mismatches: string[] = [];
    for (const u of out) {
      const expected = truthLabelAt(truth.units, u);
      if (!expected) continue;
      evaluated++;
      if ((u.label ?? '').toUpperCase() === expected.toUpperCase()) {
        correct++;
      } else {
        mismatches.push(`${expected} -> ${u.label ?? '(none)'}`);
      }
    }

    // Every truth cell should have been evaluated (geometry match found).
    expect(evaluated).toBeGreaterThanOrEqual(truth.units.length - 2);

    // Suffixed cells ("26A") regressed silently before: assert them explicitly.
    // Match by NEAREST center (adjacent cells sit within each other's size
    // tolerance, so a "first within range" lookup can grab the wrong cell).
    const suffixed = truth.units.filter((t) => /[A-Z]$/i.test(t.label ?? ''));
    for (const t of suffixed) {
      let match: EditableUnit | null = null;
      let bestDist = Infinity;
      for (const u of out) {
        const d = Math.hypot(u.bounds.cx - t.bounds.cx, u.bounds.cy - t.bounds.cy);
        if (d < bestDist) {
          bestDist = d;
          match = u;
        }
      }
      expect(bestDist).toBeLessThan(Math.min(t.bounds.width, t.bounds.height));
      expect(match?.label?.toUpperCase()).toBe(t.label!.toUpperCase());
    }

    // Ratchetable accuracy floor for the whole plan. Current: 145/145 after
    // strip + neighbor repair (the two 1↔7 engine misreads are sequence-fixed).
    const accuracy = correct / Math.max(1, evaluated);
    if (mismatches.length > 0) {
      // Surface the diff in the failure output for fast triage.
      console.log('[label regression] mismatches:', mismatches.join('  '));
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.99);
  });
});
