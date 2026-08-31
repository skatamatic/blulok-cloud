import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const listEndpoints = require('express-list-endpoints') as (
  app: import('express').Application,
) => Array<{ path: string; methods: string[] }>;

import { createApp } from '@/app';
import { openApiRegistry } from '@/openapi/registry';
import { buildOpenApiDocument } from '@/openapi/document';
import { normalizeExpressListPath, operationKey } from '@/openapi/coverage-audit';

function countPendingOperations(document: Record<string, unknown>): number {
  const paths = document.paths as Record<string, Record<string, Record<string, string>>> | undefined;
  if (!paths) return 0;
  let pending = 0;
  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods)) {
      if (operation?.['x-migration-status'] === 'pending') {
        pending += 1;
      }
    }
  }
  return pending;
}

function main(): void {
  const strict = process.argv.includes('--strict');
  const app = createApp();

  const listed = listEndpoints(app);
  const pendingRoutes: Array<{ method: string; path: string }> = [];
  for (const entry of listed) {
    if (entry.path.startsWith('/api/docs') || entry.path === '/api/openapi.json') continue;
    const path = normalizeExpressListPath(entry.path);
    if (!path) continue;
    for (const method of entry.methods) {
      if (method === 'OPTIONS' || method === 'HEAD') continue;
      pendingRoutes.push({ method: method.toLowerCase(), path });
    }
  }

  const registered = openApiRegistry.getRoutes();
  const document = buildOpenApiDocument(registered, pendingRoutes);
  const pendingInSpec = countPendingOperations(document);

  const outDir = join(__dirname, '../openapi');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'generated.json');
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');

  const complete = openApiRegistry.countByStatus('complete');
  const pathCount = Object.keys(document.paths as object).length;

  console.log(`OpenAPI spec written to ${outPath}`);
  console.log(`  Registered routes (complete): ${complete}`);
  console.log(`  Pending operations in spec: ${pendingInSpec}`);
  console.log(`  Total paths in spec: ${pathCount}`);

  if (strict && pendingInSpec > 0) {
    console.error(`ERROR: ${pendingInSpec} operations still have x-migration-status: pending`);
    process.exit(1);
  }
}

main();
