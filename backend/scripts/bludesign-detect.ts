/**
 * BluDesign layout-detection visual CLI.
 *
 * Runs the detection engine on a single image and writes:
 *   - `annotated.png`: the source overlaid with detected rotated rects (colored
 *     by detection confidence) plus an index + OCR label per box.
 *   - `result.json`: the raw `LayoutImportDetectionResult`.
 *
 * This is both the iteration tool while tuning detection and the bootstrapper
 * for `ground-truth.json` (see the fixtures README). Run with:
 *
 *   npm run bludesign:detect -- <input-image> [output-dir]
 *
 * Mirrors the other `*:e2e` scripts; executed through ts-node + tsconfig-paths.
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { getCv } from '../src/bludesign/layout-import/opencv';
import { decodeImage } from '../src/bludesign/layout-import/image/decodeImage';
import { toRgbaMat } from '../src/bludesign/layout-import/image/preprocess';
import { rectCorners } from '../src/bludesign/layout-import/geometry';
import { detectUnits } from '../src/bludesign/layout-import/detectUnits';
import type { LayoutImportDetectionResult } from '../src/bludesign/layout-import/types';

function confidenceColor(conf: number): [number, number, number] {
  // Red (low) → yellow → green (high).
  const c = Math.max(0, Math.min(1, conf));
  const r = c < 0.5 ? 255 : Math.round(255 * (1 - (c - 0.5) * 2));
  const g = c < 0.5 ? Math.round(255 * (c * 2)) : 255;
  return [r, g, 0];
}

async function annotate(
  result: LayoutImportDetectionResult,
  decoded: { data: Uint8ClampedArray; width: number; height: number }
): Promise<Buffer> {
  const cv = await getCv();
  const rgba = toRgbaMat(cv, decoded);
  try {
    for (const u of result.units) {
      const [r, g, b] = confidenceColor(u.detectionConfidence);
      const color = new cv.Scalar(r, g, b, 255);
      const corners = rectCorners(u.bounds, u.rotationRad);
      for (let i = 0; i < 4; i++) {
        const p1 = corners[i];
        const p2 = corners[(i + 1) % 4];
        cv.line(
          rgba,
          new cv.Point(Math.round(p1.x), Math.round(p1.y)),
          new cv.Point(Math.round(p2.x), Math.round(p2.y)),
          color,
          2
        );
      }
      const tag = u.label ? `${u.id}:${u.label}` : u.id;
      cv.putText(
        rgba,
        tag,
        new cv.Point(Math.round(u.bounds.cx - 10), Math.round(u.bounds.cy + 4)),
        cv.FONT_HERSHEY_SIMPLEX,
        0.35,
        new cv.Scalar(0, 0, 0, 255),
        1
      );
    }

    const out = Buffer.from(
      rgba.data.slice(0, decoded.width * decoded.height * 4)
    );
    return await sharp(out, {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    })
      .png()
      .toBuffer();
  } finally {
    rgba.delete();
  }
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const outDir = process.argv[3] || './bludesign-detect-out';
  if (!inputPath) {
    console.error(
      'Usage: npm run bludesign:detect -- <input-image> [output-dir]'
    );
    process.exit(2);
    return;
  }

  const absInput = path.resolve(inputPath);
  if (!fs.existsSync(absInput)) {
    console.error(`Input image not found: ${absInput}`);
    process.exit(2);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const buffer = fs.readFileSync(absInput);

  console.log(`Detecting units in ${absInput} ...`);
  const started = Date.now();
  const decoded = await decodeImage(buffer);
  const result = await detectUnits(decoded);
  const elapsed = Date.now() - started;

  const resultPath = path.join(outDir, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

  const annotated = await annotate(result, decoded);
  const annotatedPath = path.join(outDir, 'annotated.png');
  fs.writeFileSync(annotatedPath, annotated);

  const labeled = result.units.filter((u) => u.label).length;
  console.log(`Done in ${elapsed}ms`);
  console.log(`  image:      ${result.imageWidth}x${result.imageHeight}`);
  console.log(`  units:      ${result.units.length} (${labeled} labeled)`);
  if (result.warnings.length) {
    console.log(`  warnings:   ${result.warnings.join('; ')}`);
  }
  console.log(`  result:     ${resultPath}`);
  console.log(`  annotated:  ${annotatedPath}`);

  // OpenCV WASM keeps the event loop alive; exit explicitly.
  process.exit(0);
}

main().catch((err) => {
  console.error('bludesign:detect failed:', err);
  process.exit(1);
});
