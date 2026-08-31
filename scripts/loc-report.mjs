import fs from 'fs';
import path from 'path';

const roots = [
  { name: 'backend', dir: 'backend/src' },
  { name: 'frontend', dir: 'frontend/src' },
  { name: 'gateway-simulator', dirs: ['gateway-simulator/src', 'gateway-simulator/__tests__'] },
  { name: 'integration-tests', dir: 'integration-tests' },
];

const codeExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const skipDir = new Set(['node_modules', 'coverage', 'dist', 'build', '.git', '__mocks__']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (skipDir.has(ent.name)) continue;
      walk(p, files);
    } else {
      const ext = path.extname(ent.name).toLowerCase();
      if (codeExt.has(ext)) files.push(p);
    }
  }
  return files;
}

function isTest(f) {
  const n = f.replace(/\\/g, '/');
  return /\/(__tests__|tests)\//.test(n) || /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(n);
}

function countLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let code = 0;
  let blank = 0;
  let comment = 0;
  let inBlock = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      blank++;
      continue;
    }
    if (inBlock) {
      comment++;
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      comment++;
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//')) {
      comment++;
      continue;
    }
    code++;
  }
  return { physical: lines.length, code, blank, comment };
}

const report = {
  packages: {},
  totals: {
    files: 0,
    physical: 0,
    code: 0,
    blank: 0,
    comment: 0,
    testFiles: 0,
    testCode: 0,
    prodFiles: 0,
    prodCode: 0,
  },
  byArea: {},
};

for (const root of roots) {
  const dirs = root.dirs || [root.dir];
  const files = dirs.flatMap((d) => walk(d));
  const pkg = {
    files: 0,
    physical: 0,
    code: 0,
    blank: 0,
    comment: 0,
    testFiles: 0,
    testCode: 0,
    prodFiles: 0,
    prodCode: 0,
    byLang: {},
  };
  for (const f of files) {
    const c = countLines(f);
    const ext = path.extname(f);
    const rel = f.replace(/\\/g, '/');
    const test = isTest(f);
    pkg.files++;
    pkg.physical += c.physical;
    pkg.code += c.code;
    pkg.blank += c.blank;
    pkg.comment += c.comment;
    pkg.byLang[ext] = pkg.byLang[ext] || { files: 0, code: 0 };
    pkg.byLang[ext].files++;
    pkg.byLang[ext].code += c.code;
    if (test) {
      pkg.testFiles++;
      pkg.testCode += c.code;
    } else {
      pkg.prodFiles++;
      pkg.prodCode += c.code;
    }

    if (root.name === 'backend' || root.name === 'frontend') {
      const idx = rel.indexOf('/src/');
      const after = idx >= 0 ? rel.slice(idx + 5) : rel;
      const area = after.split('/')[0] || 'root';
      const key = `${root.name}/${area}`;
      if (!report.byArea[key]) {
        report.byArea[key] = { code: 0, files: 0, testCode: 0, prodCode: 0 };
      }
      report.byArea[key].code += c.code;
      report.byArea[key].files++;
      if (test) report.byArea[key].testCode += c.code;
      else report.byArea[key].prodCode += c.code;
    }
  }
  report.packages[root.name] = pkg;
  for (const k of Object.keys(report.totals)) {
    if (typeof pkg[k] === 'number') report.totals[k] += pkg[k];
  }
}

function bludesignLoc(base) {
  const files = walk(base);
  let prod = 0;
  let test = 0;
  let filesN = 0;
  for (const f of files) {
    const c = countLines(f);
    filesN++;
    if (isTest(f)) test += c.code;
    else prod += c.code;
  }
  return { files: filesN, prod, test, total: prod + test };
}

report.bludesign = {
  backend: bludesignLoc('backend/src/bludesign'),
  frontendComponents: bludesignLoc('frontend/src/components/bludesign'),
  frontendPages: bludesignLoc('frontend/src/pages/bludesign'),
};

fs.writeFileSync('scripts/loc-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
