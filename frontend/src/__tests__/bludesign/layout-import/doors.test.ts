/**
 * Tests for door geometry helpers and the automatic door-side assignment.
 */

import {
  clampDoorOffset,
  defaultDoor,
  doorEdgeLength,
  doorSegment,
} from '@/components/bludesign/layout-import/geometry';
import { assignDoors } from '@/components/bludesign/layout-import/doorAssignment';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

const unit = (id: string, cx: number, cy: number, w: number, h: number, extra: Partial<EditableUnit> = {}): EditableUnit => ({
  id,
  kind: 'unit',
  bounds: { cx, cy, width: w, height: h },
  rotationRad: 0,
  labelConfidence: 1,
  detectionConfidence: 1,
  label: id,
  ...extra,
});

describe('door geometry', () => {
  it('defaultDoor is centered at 80% width and auto by default', () => {
    const d = defaultDoor('bottom');
    expect(d).toEqual({ side: 'bottom', widthFraction: 0.8, offsetFraction: 0, auto: true });
    expect(defaultDoor('top', false).auto).toBe(false);
  });

  it('doorEdgeLength uses width for top/bottom and height for left/right', () => {
    const rect = { cx: 0, cy: 0, width: 100, height: 40 };
    expect(doorEdgeLength(rect, 'bottom')).toBe(100);
    expect(doorEdgeLength(rect, 'top')).toBe(100);
    expect(doorEdgeLength(rect, 'left')).toBe(40);
    expect(doorEdgeLength(rect, 'right')).toBe(40);
  });

  it('clampDoorOffset keeps the opening on its edge', () => {
    expect(clampDoorOffset(0, 0.8)).toBe(0);
    expect(clampDoorOffset(0.3, 0.8)).toBeCloseTo(0.1);
    expect(clampDoorOffset(-0.3, 0.8)).toBeCloseTo(-0.1);
    expect(clampDoorOffset(0.3, 1)).toBe(0); // full-width door can't offset
  });

  it('doorSegment resolves a centered bottom door into world endpoints', () => {
    const rect = { cx: 50, cy: 50, width: 100, height: 40 };
    const seg = doorSegment(rect, 0, defaultDoor('bottom'));
    expect(seg.length).toBeCloseTo(80);
    expect(seg.normal).toEqual({ x: 0, y: 1 });
    expect(seg.a.y).toBeCloseTo(70);
    expect(seg.b.y).toBeCloseTo(70);
    expect(seg.mid.x).toBeCloseTo(50);
    expect(Math.min(seg.a.x, seg.b.x)).toBeCloseTo(10);
    expect(Math.max(seg.a.x, seg.b.x)).toBeCloseTo(90);
  });

  it('doorSegment honors an offset along the edge', () => {
    const rect = { cx: 50, cy: 50, width: 100, height: 40 };
    const seg = doorSegment(rect, 0, { side: 'bottom', widthFraction: 0.6, offsetFraction: 0.2, auto: false });
    expect(seg.mid.x).toBeCloseTo(70); // 0.2 * 100 offset from center
  });
});

describe('assignDoors', () => {
  it('gives every unit a door facing the image interior', () => {
    // A single unit near the top of the image → door should face down.
    const units = [unit('a', 100, 25, 40, 40)];
    const out = assignDoors(units, 200, 200);
    expect(out[0].door?.side).toBe('bottom');
    expect(out[0].door?.auto).toBe(true);
  });

  it('never places a door on a wall shared with a neighbor', () => {
    // Two units stacked and touching → neither door on the shared wall.
    const units = [unit('a', 100, 40, 40, 20), unit('b', 100, 60, 40, 20)];
    const out = assignDoors(units, 200, 200);
    const a = out.find((u) => u.id === 'a')!;
    const b = out.find((u) => u.id === 'b')!;
    expect(a.door?.side).not.toBe('bottom'); // bottom is the shared wall
    expect(b.door?.side).not.toBe('top'); // top is the shared wall
  });

  it('faces doors into a shared aisle, centered by default', () => {
    // Two units across a wide aisle face each other; nothing blocks the edge so
    // both stay centered at the default width.
    const units = [unit('a', 40, 50, 40, 40), unit('b', 160, 50, 40, 40)];
    const out = assignDoors(units, 200, 100);
    const a = out.find((u) => u.id === 'a')!;
    const b = out.find((u) => u.id === 'b')!;
    expect(a.door?.side).toBe('right');
    expect(b.door?.side).toBe('left');
    expect(a.door?.offsetFraction).toBe(0);
    expect(b.door?.offsetFraction).toBe(0);
    expect(a.door?.widthFraction).toBeCloseTo(0.8);
  });

  it('puts a bottom-row door on the inside, offset and smaller when partly blocked', () => {
    // A wide unit at the bottom with a smaller unit covering the LEFT half of
    // its top edge. The door must face up (inside, toward the other units),
    // shifted into the open right half and narrowed so the unit is accessible.
    const lower = unit('low', 100, 180, 80, 30); // top edge x∈[60,140]
    const upper = unit('up', 80, 150, 40, 20); // covers x∈[60,100], maxY 160 ≈ lower.minY 165
    const out = assignDoors([lower, upper], 200, 220);
    const low = out.find((u) => u.id === 'low')!;
    expect(low.door?.side).toBe('top'); // inside, not the open bottom
    expect(low.door!.offsetFraction).toBeGreaterThan(0); // shifted toward open (right) half
    expect(low.door!.widthFraction).toBeLessThan(0.8); // narrowed to fit
  });

  it('never points a door into an adjacent unit', () => {
    // Side-by-side, flush. Neither door may sit on the shared wall.
    const a = unit('a', 30, 50, 40, 40); // x∈[10,50]
    const b = unit('b', 70, 50, 40, 40); // x∈[50,90], shares wall at x=50
    const out = assignDoors([a, b], 200, 100);
    expect(out.find((u) => u.id === 'a')!.door?.side).not.toBe('right');
    expect(out.find((u) => u.id === 'b')!.door?.side).not.toBe('left');
  });

  it('keeps doors off shared walls in a rotated row (local-frame adjacency)', () => {
    // A tilted row of deep, narrow units. Each unit's long left/right walls are
    // shared with its row-mates; the door must sit on the short frontage
    // (top/bottom), never on a wall pointing into the neighbor — even though the
    // tilted units' axis-aligned bounding boxes overlap heavily.
    const theta = 0.26; // ~15°
    const W = 40; // frontage (local x)
    const H = 120; // depth (local y)
    const step = (W + 6) * 1; // spacing along the row
    const dir = { x: Math.cos(theta), y: Math.sin(theta) };
    const units: EditableUnit[] = [];
    for (let i = 0; i < 6; i++) {
      units.push(
        unit(`u${i}`, 160 + i * step * dir.x, 200 + i * step * dir.y, W, H, { rotationRad: theta })
      );
    }
    const out = assignDoors(units, 800, 400);
    for (const u of out) {
      expect(['top', 'bottom']).toContain(u.door?.side); // never left/right (shared walls)
    }
  });

  it('preserves user-overridden doors', () => {
    const units = [
      unit('a', 100, 25, 40, 40, { door: { side: 'top', widthFraction: 0.5, offsetFraction: 0, auto: false } }),
    ];
    const out = assignDoors(units, 200, 200);
    expect(out[0].door?.side).toBe('top');
    expect(out[0].door?.widthFraction).toBe(0.5);
  });
});
