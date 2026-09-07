/**
 * After `npx jest --coverage --coverageReporters=json-summary`,
 * prints weighted line coverage by top-level src area.
 * Usage (backend):  cd backend && npx jest --coverage --coverageReporters=json-summary --silent && node ../scripts/print-coverage-by-area.mjs backend
 * Usage (frontend): cd frontend && npx jest --coverage --coverageReporters=json-summary --silent && node ../scripts/print-coverage-by-area.mjs frontend
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] === 'frontend' ? 'frontend' : 'backend';
const summaryPath = path.join(__dirname, '..', root, 'coverage', 'coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error('Missing', summaryPath, '— run jest with --coverageReporters=json-summary first.');
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

function relKey(k) {
  const norm = k.replace(/\\/g, '/');
  const i = norm.indexOf('/src/');
  return i >= 0 ? norm.slice(i + 1) : norm;
}

const rows = [];
for (const [k, v] of Object.entries(j)) {
  if (k === 'total') continue;
  const rel = relKey(k);
  if (rel.includes('__tests__')) continue;
  rows.push({ file: rel, lines: v.lines.pct, nlines: v.lines.total });
}

function bucketBackend(f) {
  if (f.startsWith('src/database/')) return 'database (migrations/seeds)';
  if (f.startsWith('src/services/')) return 'services/' + f.split('/').slice(2, 3).join('/');
  if (f.startsWith('src/routes/')) return 'routes';
  if (f.startsWith('src/models/')) return 'models';
  if (f.startsWith('src/middleware/')) return 'middleware';
  if (f.startsWith('src/controllers/')) return 'controllers';
  if (f.startsWith('src/utils/')) return 'utils';
  if (f.startsWith('src/config/')) return 'config';
  if (f.startsWith('src/bludesign/')) return 'bludesign';
  if (f.startsWith('src/types/')) return 'types';
  return 'root (app.ts, index, etc.)';
}

function bucketFrontend(f) {
  if (f.startsWith('src/components/bludesign/')) return 'components/bludesign (3D editor)';
  if (f.startsWith('src/components/')) return 'components/' + f.split('/').slice(2, 3).join('/');
  if (f.startsWith('src/pages/')) return 'pages';
  if (f.startsWith('src/services/')) return 'services';
  if (f.startsWith('src/contexts/')) return 'contexts';
  if (f.startsWith('src/hooks/')) return 'hooks';
  if (f.startsWith('src/api/')) return 'api';
  if (f.startsWith('src/utils/')) return 'utils';
  return 'root (App, etc.)';
}

const bucket = root === 'frontend' ? bucketFrontend : bucketBackend;
const agg = {};
for (const r of rows) {
  const b = bucket(r.file);
  if (!agg[b]) agg[b] = { cov: 0, lines: 0 };
  agg[b].cov += r.lines * r.nlines;
  agg[b].lines += r.nlines;
}

console.log('\n===', root.toUpperCase(), '— weighted line % by area ===\n');
console.log('TOTAL', j.total.lines.pct + '% lines\n');
Object.entries(agg)
  .map(([k, v]) => ({ k, w: v.lines ? v.cov / v.lines : 0, n: v.lines }))
  .sort((a, b) => a.w - b.w)
  .forEach((x) => console.log(String(x.w.toFixed(1)).padStart(6) + '%  ' + String(x.n).padStart(6) + ' loc  ' + x.k));
