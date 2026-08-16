/**
 * Rank low-hanging coverage targets from coverage-summary.json.
 * Prefers: lower line %, smaller files, not type-only barrels.
 * Usage: node scripts/rank-coverage-gaps.mjs [backend|frontend|both]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const which = process.argv[2] || 'both';

function load(root) {
  const summaryPath = path.join(repoRoot, root, 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.error('Missing', summaryPath);
    return null;
  }
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function relKey(k) {
  const norm = k.replace(/\\/g, '/');
  const i = norm.indexOf('/src/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

function isSkip(rel) {
  if (rel.includes('__tests__')) return true;
  if (rel.endsWith('.d.ts')) return true;
  if (rel.endsWith('/index.ts') || rel.endsWith('/index.tsx')) return true;
  if (rel.includes('.types.ts') || rel.includes('/types/')) return true;
  if (rel.includes('provider.types')) return true;
  if (rel.includes('gateway-transport.interface')) return true;
  return false;
}

function score(row) {
  // Lower is better target: low coverage + not huge file.
  // Uncovered lines weight + size penalty for giants.
  const uncovered = Math.max(0, row.nlines - Math.round((row.lines / 100) * row.nlines));
  const sizePenalty = row.nlines > 400 ? (row.nlines - 400) * 0.15 : 0;
  return uncovered * 1.2 + (100 - row.lines) * 0.4 + sizePenalty - (row.nlines < 120 ? 8 : 0);
}

function analyze(root) {
  const j = load(root);
  if (!j) return;
  const rows = [];
  for (const [k, v] of Object.entries(j)) {
    if (k === 'total') continue;
    const rel = relKey(k);
    if (isSkip(rel)) continue;
    const lines = v.lines.pct;
    const nlines = v.lines.total;
    if (nlines < 5) continue;
    if (lines >= 85) continue;
    rows.push({
      file: rel,
      lines,
      nlines,
      uncovered: Math.max(0, nlines - Math.round((lines / 100) * nlines)),
      branches: v.branches.pct,
      functions: v.functions.pct,
    });
  }

  const easy = rows
    .filter((r) => r.nlines <= 200 && r.lines < 70)
    .sort((a, b) => score(a) - score(b) || a.nlines - b.nlines);

  const medium = rows
    .filter((r) => r.nlines > 200 && r.nlines <= 600 && r.lines < 75)
    .sort((a, b) => b.uncovered - a.uncovered);

  const giants = rows
    .filter((r) => r.nlines > 600 && r.lines < 80)
    .sort((a, b) => b.uncovered - a.uncovered)
    .slice(0, 12);

  console.log(`\n========== ${root.toUpperCase()} ==========`);
  console.log(
    `TOTAL lines ${j.total.lines.pct}%  (${j.total.lines.covered}/${j.total.lines.total})  branches ${j.total.branches.pct}%`,
  );

  console.log('\n--- Low-hanging (≤200 LOC, <70% lines) ---');
  for (const r of easy.slice(0, 25)) {
    console.log(
      `${String(r.lines.toFixed(1)).padStart(6)}%  ${String(r.nlines).padStart(4)} loc  ${String(r.uncovered).padStart(3)} miss  ${r.file}`,
    );
  }

  console.log('\n--- Medium files (201–600 LOC, <75%) by uncovered lines ---');
  for (const r of medium.slice(0, 15)) {
    console.log(
      `${String(r.lines.toFixed(1)).padStart(6)}%  ${String(r.nlines).padStart(4)} loc  ${String(r.uncovered).padStart(3)} miss  ${r.file}`,
    );
  }

  console.log('\n--- Large gaps (>600 LOC) — not low-hanging ---');
  for (const r of giants) {
    console.log(
      `${String(r.lines.toFixed(1)).padStart(6)}%  ${String(r.nlines).padStart(4)} loc  ${String(r.uncovered).padStart(3)} miss  ${r.file}`,
    );
  }

  return { total: j.total, easy, medium, giants };
}

const results = {};
if (which === 'both' || which === 'backend') results.backend = analyze('backend');
if (which === 'both' || which === 'frontend') results.frontend = analyze('frontend');

fs.writeFileSync(
  path.join(repoRoot, 'scripts', 'coverage-gap-rank.json'),
  JSON.stringify(results, null, 2),
);
console.log('\nWrote scripts/coverage-gap-rank.json');
