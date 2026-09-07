const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.schemas.ts')) fixImport(full);
  }
}

function fixImport(file) {
  let content = fs.readFileSync(file, 'utf8');
  const needs = [];
  if (content.includes('routeIdField()')) needs.push('routeIdField');
  if (content.includes('strictUuidField()')) needs.push('strictUuidField');
  if (needs.length === 0) return;

  const importRe = /import \{([^}]+)\} from '@\/openapi\/common-schemas';/;
  const match = content.match(importRe);
  if (match) {
    const existing = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    let changed = false;
    for (const name of needs) {
      if (!existing.includes(name)) {
        existing.push(name);
        changed = true;
      }
    }
    if (!changed) return;
    const newImport = `import { ${existing.join(', ')} } from '@/openapi/common-schemas';`;
    content = content.replace(importRe, newImport);
  } else {
    content = content.replace(
      /^import Joi from 'joi';\n/,
      `import Joi from 'joi';\nimport { ${needs.join(', ')} } from '@/openapi/common-schemas';\n`,
    );
  }
  fs.writeFileSync(file, content);
  console.log('fixed:', file);
}

walk(path.join(__dirname, '../src/schemas'));
