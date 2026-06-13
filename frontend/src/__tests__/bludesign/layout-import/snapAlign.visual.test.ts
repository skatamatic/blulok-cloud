/**
 * Visual before/after PNG montages for snap-align iteration.
 * Boxes only — no underlying plan image.
 *
 * Run: npm test -- snapAlign.visual.test.ts
 * Inspect: backend/_snap-visual-out/*.png
 */

import * as fs from 'fs';
import * as path from 'path';
import { snapAlignUnits } from '@/components/bludesign/layout-import/snapAlign';
import type { EditableUnit } from '@/components/bludesign/layout-import/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('../../../../../backend/node_modules/sharp') as typeof import('sharp');

const GT_PATH = path.join(
  __dirname,
  '../../../../../backend/src/bludesign/layout-import/__tests__/fixtures/ground-truth.json'
);
const OUT_DIR = path.join(__dirname, '../../../../../backend/_snap-visual-out');

const BG = { r: 24, g: 24, b: 27 };

interface Point {
  x: number;
  y: number;
}

interface GtUnit {
  bounds: EditableUnit['bounds'];
  rotationRad: number;
  label?: string;
}

function rectCorners(rect: EditableUnit['bounds'], rotationRad: number): Point[] {
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const local: Point[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => ({
    x: rect.cx + p.x * cos - p.y * sin,
    y: rect.cy + p.x * sin + p.y * cos,
  }));
}

function toEditable(u: GtUnit, id: string): EditableUnit {
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

function bboxOfUnits(units: EditableUnit[], pad: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const u of units) {
    for (const c of rectCorners(u.bounds, u.rotationRad)) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
      maxX = Math.max(maxX, c.x);
    }
  }
  return {
    x: Math.floor(minX - pad),
    y: Math.floor(minY - pad),
    width: Math.ceil(maxX - minX + pad * 2),
    height: Math.ceil(maxY - minY + pad * 2),
  };
}

function svgOverlay(
  units: EditableUnit[],
  crop: { x: number; y: number; width: number; height: number },
  stroke: string,
  fill: string
): string {
  return units
    .map((u) => {
      const pts = rectCorners(u.bounds, u.rotationRad)
        .map((c) => `${(c.x - crop.x).toFixed(1)},${(c.y - crop.y).toFixed(1)}`)
        .join(' ');
      const label = u.label ?? u.id;
      const lx = (u.bounds.cx - crop.x).toFixed(1);
      const ly = (u.bounds.cy - crop.y).toFixed(1);
      return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <text x="${lx}" y="${ly}" fill="#e5e5e5" font-size="11" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
    })
    .join('\n');
}

function svgRowGuide(
  units: EditableUnit[],
  crop: { x: number; y: number; width: number; height: number }
): string {
  if (units.length < 2) return '';
  const sorted = [...units].sort((a, b) => a.bounds.cx - b.bounds.cx);
  const a = sorted[0].bounds;
  const b = sorted[sorted.length - 1].bounds;
  return `<line x1="${(a.cx - crop.x).toFixed(1)}" y1="${(a.cy - crop.y).toFixed(1)}" x2="${(b.cx - crop.x).toFixed(1)}" y2="${(b.cy - crop.y).toFixed(1)}" stroke="#fbbf24" stroke-width="1" stroke-dasharray="4,3" opacity="0.85"/>`;
}

async function renderPanel(
  units: EditableUnit[],
  crop: { x: number; y: number; width: number; height: number },
  stroke: string,
  fill: string
): Promise<Buffer> {
  const { width: cw, height: ch } = crop;
  const svg = `<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="rgb(${BG.r},${BG.g},${BG.b})"/>
    ${svgRowGuide(units, crop)}${svgOverlay(units, crop, stroke, fill)}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function montage(
  before: EditableUnit[],
  after: EditableUnit[],
  crop: { x: number; y: number; width: number; height: number },
  title: string,
  scale: number
): Promise<Buffer> {
  const cw = crop.width;
  const ch = crop.height;
  const header = 28;
  const gap = 12;
  const totalW = cw * 2 + gap;
  const totalH = ch + header;

  const beforePanel = await renderPanel(before, crop, '#ef4444', 'rgba(239,68,68,0.35)');
  const afterPanel = await renderPanel(after, crop, '#22c55e', 'rgba(34,197,94,0.35)');

  const headerSvg = Buffer.from(
    `<svg width="${totalW}" height="${header}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111"/>
      <text x="8" y="18" fill="#fff" font-size="13" font-family="sans-serif">${title}</text>
      <text x="${Math.floor(cw / 2)}" y="18" fill="#fca5a5" font-size="11" font-family="sans-serif" text-anchor="middle">BEFORE</text>
      <text x="${cw + gap + Math.floor(cw / 2)}" y="18" fill="#86efac" font-size="11" font-family="sans-serif" text-anchor="middle">AFTER</text>
    </svg>`
  );

  let png = await sharp({
    create: { width: totalW, height: totalH, channels: 3, background: BG },
  })
    .composite([
      { input: headerSvg, top: 0, left: 0 },
      { input: beforePanel, top: header, left: 0 },
      { input: afterPanel, top: header, left: cw + gap },
    ])
    .png()
    .toBuffer();

  if (scale > 1) {
    const meta = await sharp(png).metadata();
    png = await sharp(png)
      .resize((meta.width ?? 1) * scale, (meta.height ?? 1) * scale, {
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
  }
  return png;
}

async function writeMontage(
  all: EditableUnit[],
  name: string,
  labels: string[],
  pad: number,
  scale: number,
  mode: 'isolated' | 'full' | 'selection'
) {
  const before = all.filter((u) => labels.includes(u.label!));
  const ids = new Set(before.map((u) => u.id));

  let after: EditableUnit[];
  if (mode === 'isolated') {
    after = snapAlignUnits(before);
  } else if (mode === 'selection') {
    after = snapAlignUnits(all, { onlyIds: ids });
    after = after.filter((u) => labels.includes(u.label!));
  } else {
    after = snapAlignUnits(all).filter((u) => labels.includes(u.label!));
  }

  const crop = bboxOfUnits(before, pad);
  const png = await montage(before, after, crop, `${name} (${mode})`, scale);
  fs.writeFileSync(path.join(OUT_DIR, `${name}-${mode}.png`), png);
  console.log('[visual] wrote', `${name}-${mode}.png`);
}

describe('snapAlign visual montages', () => {
  it('writes before/after PNGs to backend/_snap-visual-out', async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const gt = JSON.parse(fs.readFileSync(GT_PATH, 'utf8')) as { units: GtUnit[] };
    const all = gt.units.filter((u) => u.label).map((u, i) => toEditable(u, `gt-${i}`));

    const segments: { name: string; labels: string[]; pad: number; scale: number }[] = [
      { name: 'row-1-9', labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], pad: 20, scale: 5 },
      { name: 'row-11-12', labels: ['11', '12'], pad: 30, scale: 6 },
      { name: 'row-67-73', labels: ['67', '68', '69', '70', '71', '72', '73'], pad: 24, scale: 4 },
      { name: 'row-120-123', labels: ['120', '121', '122', '123'], pad: 24, scale: 5 },
      { name: 'col-99-102', labels: ['99', '100', '101', '102'], pad: 24, scale: 5 },
    ];

    for (const seg of segments) {
      await writeMontage(all, seg.name, seg.labels, seg.pad, seg.scale, 'isolated');
      await writeMontage(all, seg.name, seg.labels, seg.pad, seg.scale, 'full');
      await writeMontage(all, seg.name, seg.labels, seg.pad, seg.scale, 'selection');
    }

    expect(fs.existsSync(path.join(OUT_DIR, 'row-1-9-isolated.png'))).toBe(true);
  }, 60_000);
});
