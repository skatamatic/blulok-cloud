import * as fs from 'fs';
import * as path from 'path';
import {
  dedupeOverlappingUnits,
  postProcessImportedUnits,
} from '@/components/bludesign/layout-import/postProcess';
import { doorSegment, pointInRect } from '@/components/bludesign/layout-import/geometry';
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
    labelConfidence: 1,
    detectionConfidence: 1,
    manual: false,
    edited: false,
  };
}

function loadGt() {
  return JSON.parse(fs.readFileSync(GT_PATH, 'utf8')) as {
    imageWidth: number;
    imageHeight: number;
    units: Array<{ bounds: EditableUnit['bounds']; rotationRad: number; label?: string }>;
  };
}

describe('postProcessImportedUnits', () => {
  it('gives every unit a door that never opens into a neighbor', () => {
    const gt = loadGt();
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];
    const row = gt.units
      .filter((u) => labels.includes(u.label ?? ''))
      .map((u, i) => toEditable(u, `gt-${i}`));

    const out = postProcessImportedUnits(row, gt.imageWidth, gt.imageHeight);
    expect(out.length).toBe(row.length);

    for (const u of out) {
      expect(u.door?.side).toBeTruthy();
      expect(u.door!.widthFraction).toBeGreaterThan(0);
      expect(u.door!.widthFraction).toBeLessThanOrEqual(1);

      // Step just outside the door midpoint — that point must not be inside
      // any other unit (a door never opens into a neighbor).
      const seg = doorSegment(u.bounds, u.rotationRad, u.door!);
      const step = 0.25 * Math.min(u.bounds.width, u.bounds.height);
      const probe = { x: seg.mid.x + seg.normal.x * step, y: seg.mid.y + seg.normal.y * step };
      for (const other of out) {
        if (other.id === u.id) continue;
        expect(pointInRect(probe, other.bounds, other.rotationRad)).toBe(false);
      }
    }

    // The tilted locker row should agree on one frontage side.
    const tilted = out.filter((u) => Math.abs(u.rotationRad) > 0.7);
    if (tilted.length >= 3) {
      const counts = new Map<string, number>();
      for (const u of tilted) {
        const s = u.door?.side ?? '';
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const dominant = Math.max(...counts.values());
      expect(dominant).toBeGreaterThanOrEqual(Math.ceil(tilted.length * 0.85));
    }
  });

  it('snap-aligns the full ground-truth plan without re-posing it', () => {
    const gt = loadGt();
    const all = gt.units.map((u, i) => toEditable(u, `gt-${i}`));
    const out = postProcessImportedUnits(all, gt.imageWidth, gt.imageHeight);

    // Every output unit stays close to where the detector put it.
    const byId = new Map(all.map((u) => [u.id, u]));
    for (const u of out) {
      const orig = byId.get(u.id)!;
      const dist = Math.hypot(u.bounds.cx - orig.bounds.cx, u.bounds.cy - orig.bounds.cy);
      expect(dist).toBeLessThanOrEqual(Math.min(orig.bounds.width, orig.bounds.height));
    }
  });

  it('dedupeOverlappingUnits drops nested duplicates and keeps distinct units', () => {
    const a = toEditable({ bounds: { cx: 100, cy: 100, width: 40, height: 30 }, rotationRad: 0, label: '1' }, 'a');
    const nested = toEditable({ bounds: { cx: 102, cy: 101, width: 36, height: 26 }, rotationRad: 0 }, 'b');
    const distinct = toEditable({ bounds: { cx: 160, cy: 100, width: 40, height: 30 }, rotationRad: 0, label: '2' }, 'c');
    const out = dedupeOverlappingUnits([a, nested, distinct]);
    expect(out.map((u) => u.id).sort()).toEqual(['a', 'c']);
  });
});
