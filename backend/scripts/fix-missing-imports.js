const fs = require('fs');

const files = [
  'src/schemas/access-control.schemas.ts',
  'src/schemas/activity.schemas.ts',
  'src/schemas/bludesign/asset-definitions.schemas.ts',
  'src/schemas/bludesign/assets.schemas.ts',
  'src/schemas/bludesign/facilities.schemas.ts',
  'src/schemas/bludesign/projects.schemas.ts',
  'src/schemas/dashboard-assignments.schemas.ts',
  'src/schemas/facilities.schemas.ts',
  'src/schemas/facility-provisioning.schemas.ts',
  'src/schemas/notifications.schemas.ts',
  'src/schemas/saved-dashboards.schemas.ts',
  'src/schemas/unit.schemas.ts',
  'src/schemas/units-list.schemas.ts',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const needsRoute = content.includes('routeIdField()');
  const needsStrict = content.includes('strictUuidField()');
  const names = [];
  if (needsRoute) names.push('routeIdField');
  if (needsStrict) names.push('strictUuidField');

  const importRe = /import \{([^}]+)\} from '@\/openapi\/common-schemas';/;
  const match = content.match(importRe);
  if (match) {
    const existing = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      if (!existing.includes(name)) existing.push(name);
    }
    content = content.replace(importRe, `import { ${existing.join(', ')} } from '@/openapi/common-schemas';`);
  } else {
    content = content.replace(
      "import Joi from 'joi';",
      `import Joi from 'joi';\nimport { ${names.join(', ')} } from '@/openapi/common-schemas';`,
    );
  }
  fs.writeFileSync(file, content);
  console.log('ok', file);
}
