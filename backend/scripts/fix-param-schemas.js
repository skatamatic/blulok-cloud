const fs = require('fs');
const path = require('path');

const STRICT = new Set(['access-control.schemas.ts', 'activity.schemas.ts']);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.schemas.ts')) fix(full, entry.name);
  }
}

function fix(file, base) {
  let content = fs.readFileSync(file, 'utf8');
  if (!/ParamSchema/.test(content)) return;

  if (!content.includes("from '@/openapi/common-schemas'")) {
    content = content.replace(
      /^import Joi from 'joi';\n/,
      "import Joi from 'joi';\nimport { routeIdField, strictUuidField } from '@/openapi/common-schemas';\n",
    );
  }

  const field = STRICT.has(base) ? 'strictUuidField()' : 'routeIdField()';
  const updated = content.replace(
    /export const (\w*ParamSchema\w*) = Joi\.object\(\{([\s\S]*?)\}\);/g,
    (match, name, body) => {
      const newBody = body.replace(/(\w+):\s*Joi\.string\(\)\.min\(1\)\.required\(\)/g, `$1: ${field}`);
      if (newBody === body) return match;
      return `export const ${name} = Joi.object({${newBody}});`;
    },
  );

  if (updated !== content) {
    fs.writeFileSync(file, updated);
    console.log(`${STRICT.has(base) ? 'strict' : 'flex'}: ${file}`);
  }
}

walk(path.join(__dirname, '../src/schemas'));
