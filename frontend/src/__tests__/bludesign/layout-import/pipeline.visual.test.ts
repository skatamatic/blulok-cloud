/**
 * Full-pipeline visual harness: real detector output → label resolution →
 * ingest filter → snap align → door assignment, rendered over the actual plan.
 *
 * Run: npm test -- --testPathPattern=pipeline.visual --no-coverage
 * Inspect: backend/_pipeline-visual-out/*.png
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  dedupeOverlappingUnits,
  postProcessImportedUnits,
} from '@/components/bludesign/layout-import/postProcess';
import { filterUnitsForIngest } from '@/components/bludesign/layout-import/labelResolution';
import { doorSegment, rectCorners } from '@/components/bludesign/layout-import/geometry';
import type {
  DetectedUnitCandidate,
  EditableUnit,
} from '@/components/bludesign/layout-import/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('../../../../../backend/node_modules/sharp') as typeof import('sharp');

const BACKEND = path.join(__dirname, '../../../../../backend');
const RESULT_PATH = path.join(BACKEND, '_detect-out/result.json');
const PLAN_PATH = path.join(
  BACKEND,
  'src/bludesign/layout-import/__tests__/fixtures/test_site_layout.png'
);
const OUT_DIR = path.join(BACKEND, '_pipeline-visual-out');

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function toEditable(u: DetectedUnitCandidate): EditableUnit {
  return { ...u, manual: false, edited: false };
}

function runPipeline(raw: DetectedUnitCandidate[], imgW: number, imgH: number) {
  const editable = raw.map(toEditable);
  // "before" = cleaned input (same filters the pipeline applies) pre-snap/doors.
  const ingested = dedupeOverlappingUnits(filterUnitsForIngest(editable));
  const after = postProcessImportedUnits(editable, imgW, imgH);
  return { ingested, after };
}

function unitsSvg(units: EditableUnit[], crop: Crop, opts: { doors: boolean; stroke: string }) {
  const parts: string[] = [];
  for (const u of units) {
    const pts = rectCorners(u.bounds, u.rotationRad)
      .map((c) => `${(c.x - crop.x).toFixed(1)},${(c.y - crop.y).toFixed(1)}`)
      .join(' ');
    parts.push(
      `<polygon points="${pts}" fill="rgba(34,197,94,0.14)" stroke="${opts.stroke}" stroke-width="1.6"/>`
    );
    if (u.label) {
      parts.push(
        `<text x="${(u.bounds.cx - crop.x).toFixed(1)}" y="${(u.bounds.cy - crop.y).toFixed(
          1
        )}" fill="#1d4ed8" font-size="9" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${u.label}</text>`
      );
    }
    if (opts.doors && u.door) {
      const seg = doorSegment(u.bounds, u.rotationRad, u.door);
      parts.push(
        `<line x1="${(seg.a.x - crop.x).toFixed(1)}" y1="${(seg.a.y - crop.y).toFixed(1)}" x2="${(
          seg.b.x - crop.x
        ).toFixed(1)}" y2="${(seg.b.y - crop.y).toFixed(1)}" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round"/>`
      );
      // Facing tick: small line out from door midpoint along the outward normal.
      parts.push(
        `<line x1="${(seg.mid.x - crop.x).toFixed(1)}" y1="${(seg.mid.y - crop.y).toFixed(1)}" x2="${(
          seg.mid.x + seg.normal.x * 6 - crop.x
        ).toFixed(1)}" y2="${(seg.mid.y + seg.normal.y * 6 - crop.y).toFixed(
          1
        )}" stroke="#dc2626" stroke-width="1.6"/>`
      );
    }
  }
  return parts.join('\n');
}

/** Plan image opacity in the renders — keep faint so vectors dominate. */
const PLAN_OPACITY = 0.15;

async function renderOverPlan(
  units: EditableUnit[],
  crop: Crop,
  scale: number,
  opts: { doors: boolean; stroke: string }
): Promise<Buffer> {
  const faintPlan = await sharp(PLAN_PATH)
    .extract({
      left: Math.max(0, crop.x),
      top: Math.max(0, crop.y),
      width: crop.width,
      height: crop.height,
    })
    .removeAlpha()
    .ensureAlpha(PLAN_OPACITY)
    .png()
    .toBuffer();
  const svg = `<svg width="${crop.width}" height="${crop.height}" xmlns="http://www.w3.org/2000/svg">${unitsSvg(
    units,
    crop,
    opts
  )}</svg>`;
  const composed = await sharp({
    create: {
      width: crop.width,
      height: crop.height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: faintPlan, top: 0, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
  if (scale === 1) return composed;
  return sharp(composed)
    .resize(crop.width * scale, crop.height * scale, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

function cropForLabels(units: EditableUnit[], labels: string[], pad: number, imgW: number, imgH: number): Crop {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const u of units) {
    if (!labels.includes(u.label ?? '')) continue;
    for (const c of rectCorners(u.bounds, u.rotationRad)) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }
  }
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  return {
    x,
    y,
    width: Math.min(imgW - x, Math.ceil(maxX - minX + pad * 2)),
    height: Math.min(imgH - y, Math.ceil(maxY - minY + pad * 2)),
  };
}

function range(a: number, b: number): string[] {
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(String(i));
  return out;
}

describe('pipeline visual harness', () => {
  it('renders full-pipeline output over the plan', async () => {
    if (!fs.existsSync(RESULT_PATH)) {
      console.warn(`Skipping pipeline visual test: missing ${RESULT_PATH}`);
      return;
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const result = JSON.parse(fs.readFileSync(RESULT_PATH, 'utf8')) as {
      imageWidth: number;
      imageHeight: number;
      units: DetectedUnitCandidate[];
    };

    const { ingested, after } = runPipeline(result.units, result.imageWidth, result.imageHeight);
    console.log(`[pipeline] ingested ${ingested.length} → after ${after.length}`);

    // Full-plan overview.
    const full: Crop = { x: 0, y: 0, width: result.imageWidth, height: result.imageHeight };
    fs.writeFileSync(
      path.join(OUT_DIR, 'full-after.png'),
      await renderOverPlan(after, full, 1, { doors: true, stroke: '#16a34a' })
    );

    // Problem-area crops (3x): chosen to cover every cluster type on the plan.
    const crops: { name: string; labels: string[]; pad: number; scale: number }[] = [
      { name: 'row-1-13', labels: range(1, 13), pad: 16, scale: 4 },
      { name: 'row-14-24', labels: range(14, 24), pad: 16, scale: 4 },
      { name: 'tower-25-32', labels: range(25, 32), pad: 16, scale: 4 },
      { name: 'tower-33-40', labels: range(33, 40), pad: 16, scale: 4 },
      { name: 'tower-41-48', labels: range(41, 48), pad: 16, scale: 4 },
      { name: 'tower-53-61', labels: range(53, 61), pad: 16, scale: 4 },
      { name: 'row-62-75', labels: range(62, 75), pad: 16, scale: 4 },
      { name: 'green-76-87', labels: range(76, 87), pad: 16, scale: 4 },
      { name: 'yellow-88-102', labels: range(88, 102), pad: 16, scale: 3 },
      { name: 'pink-103-116', labels: range(103, 116), pad: 16, scale: 4 },
      { name: 'cyan-117-141', labels: range(117, 141), pad: 16, scale: 4 },
    ];

    for (const c of crops) {
      const crop = cropForLabels(after, c.labels, c.pad, result.imageWidth, result.imageHeight);
      if (!Number.isFinite(crop.x) || crop.width <= 0) {
        console.log(`[pipeline] skip ${c.name}: no labeled units`);
        continue;
      }
      fs.writeFileSync(
        path.join(OUT_DIR, `${c.name}-after.png`),
        await renderOverPlan(
          after.filter((u) => {
            const cs = rectCorners(u.bounds, u.rotationRad);
            return cs.some(
              (p) =>
                p.x >= crop.x &&
                p.x <= crop.x + crop.width &&
                p.y >= crop.y &&
                p.y <= crop.y + crop.height
            );
          }),
          crop,
          c.scale,
          { doors: true, stroke: '#16a34a' }
        )
      );
      fs.writeFileSync(
        path.join(OUT_DIR, `${c.name}-before.png`),
        await renderOverPlan(
          ingested.filter((u) => {
            const cs = rectCorners(u.bounds, u.rotationRad);
            return cs.some(
              (p) =>
                p.x >= crop.x &&
                p.x <= crop.x + crop.width &&
                p.y >= crop.y &&
                p.y <= crop.y + crop.height
            );
          }),
          crop,
          c.scale,
          { doors: false, stroke: '#dc2626' }
        )
      );
      console.log(`[pipeline] wrote ${c.name}`);
    }

    expect(after.length).toBeGreaterThan(0);
  }, 120_000);
});
