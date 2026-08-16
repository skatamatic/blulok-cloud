/**
 * Heuristic: list small/medium src modules with no dedicated test file mention.
 * Usage: node scripts/find-untested-modules.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['__tests__', 'node_modules', 'test', 'bludesign', 'blufms', 'GoogleMaps'].includes(e.name)) {
        continue;
      }
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith('.d.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

function collectTests(srcRoot) {
  const tests = [];
  const testsRoot = path.join(srcRoot, '__tests__');
  function wt(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) wt(p);
      else if (/\.test\.(ts|tsx)$/.test(e.name)) {
        tests.push({
          name: e.name,
          rel: path.relative(srcRoot, p).replace(/\\/g, '/'),
          body: fs.readFileSync(p, 'utf8'),
        });
      }
    }
  }
  wt(testsRoot);
  return tests;
}

function hasDedicatedTest(file, srcRoot, tests) {
  const base = path.basename(file).replace(/\.(ts|tsx)$/, '');
  const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
  return tests.some((t) => {
    if (t.name.startsWith(`${base}.`)) return true;
    if (t.body.includes(rel)) return true;
    if (t.body.includes(`/${base}`)) return true;
    if (t.body.includes(`'${base}'`) || t.body.includes(`"${base}"`)) return true;
    return false;
  });
}

for (const root of ['backend', 'frontend']) {
  const src = path.join(repoRoot, root, 'src');
  const tests = collectTests(src);
  const files = walk(src).map((f) => ({
    f,
    rel: path.relative(src, f).replace(/\\/g, '/'),
    lines: fs.readFileSync(f, 'utf8').split(/\n/).length,
  }));
  const focus = files.filter(
    (x) =>
      x.rel.startsWith('utils/') ||
      x.rel.startsWith('hooks/') ||
      x.rel.startsWith('middleware/') ||
      x.rel.startsWith('schemas/') ||
      (x.rel.startsWith('services/') && x.lines < 280),
  );
  const noTest = focus
    .filter((x) => !hasDedicatedTest(x.f, src, tests))
    .sort((a, b) => a.lines - b.lines);

  console.log(`\n=== ${root} — small/medium modules with no dedicated test mention ===`);
  for (const x of noTest.slice(0, 40)) {
    console.log(String(x.lines).padStart(5), x.rel);
  }
}
