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
];

for (const { from, to } of ASSETS) {
  const src = path.join(ROOT, from);
  const dest = path.join(ROOT, to);

  if (!fs.existsSync(src)) {
    console.error(`copy-build-assets: missing required asset: ${from}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);

  const sizeKb = Math.round(fs.statSync(dest).size / 1024);
  console.log(`copy-build-assets: ${from} → ${to} (${sizeKb} KiB)`);
}
