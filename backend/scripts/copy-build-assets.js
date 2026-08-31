/**
 * Copy non-TypeScript runtime assets into dist/ after tsc.
 * TypeScript only emits .js/.d.ts — vendored binaries must be mirrored manually.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** @type {Array<{ from: string; to: string }>} */
const ASSETS = [
  {
    from: 'src/bludesign/layout-import/ocr/tessdata/eng.traineddata.gz',
    to: 'dist/src/bludesign/layout-import/ocr/tessdata/eng.traineddata.gz',
  },
  {
    from: 'openapi/generated.json',
    to: 'dist/openapi/generated.json',
  },
];

for (const { from, to } of ASSETS) {
  const src = path.join(ROOT, from);
  const dest = path.join(ROOT, to);

  if (!fs.existsSync(src)) {
    if (from === 'openapi/generated.json') {
      console.warn(`copy-build-assets: skipping optional asset (run openapi:generate first): ${from}`);
      continue;
    }
    console.error(`copy-build-assets: missing required asset: ${from}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);

  const sizeKb = Math.round(fs.statSync(dest).size / 1024);
  console.log(`copy-build-assets: ${from} → ${to} (${sizeKb} KiB)`);
}
