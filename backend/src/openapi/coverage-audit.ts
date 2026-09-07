import { openApiRegistry } from '@/openapi/registry';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const listEndpoints = require('express-list-endpoints') as (
  app: import('express').Application,
) => Array<{ path: string; methods: string[] }>;

export function expressPathToOpenApi(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** express-list-endpoints emits RegExp fragments for mergeParams mounts; reconstruct canonical paths. */
function extractPathAfterRegExp(rawPath: string): string {
  const reIndex = rawPath.indexOf('RegExp(');
  if (reIndex === -1) return '';
  let depth = 0;
  for (let i = reIndex + 'RegExp('.length; i < rawPath.length; i++) {
    const ch = rawPath[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) {
        return rawPath.slice(i + 1).trim();
      }
      depth--;
    }
  }
  return '';
}

export function normalizeExpressListPath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed.includes('RegExp')) {
    return expressPathToOpenApi(trimmed);
  }

  const suffix = extractPathAfterRegExp(trimmed).replace(/^\//, '');

  if (trimmed.includes('provisioning-data')) {
    const base = '/api/v1/facilities/:facilityId/provisioning-data';
    return expressPathToOpenApi(suffix ? `${base}/${suffix}` : base);
  }

  if (trimmed.includes('projects') && trimmed.includes('assets')) {
    const base = '/api/v1/bludesign/projects/:projectId/assets';
    return expressPathToOpenApi(suffix ? `${base}/${suffix}` : base);
  }

  return null;
}

export function operationKey(method: string, openApiPath: string): string {
  return `${method.toUpperCase()} ${openApiPath}`;
}

export type OpenApiCoverageReport = {
  expressOperationCount: number;
  registeredOperationCount: number;
  completeRegistrationCount: number;
  missingFromRegistry: string[];
  pendingOnly: string[];
  extraInRegistry: string[];
  duplicateRegistryKeys: string[];
};

export function auditOpenApiCoverage(app: import('express').Application): OpenApiCoverageReport {
  const listed = listEndpoints(app);

  const expressOps = new Set<string>();
  for (const entry of listed) {
    if (entry.path.startsWith('/api/docs') || entry.path === '/api/openapi.json') continue;
    const path = normalizeExpressListPath(entry.path);
    if (!path) continue;
    for (const method of entry.methods) {
      if (method === 'OPTIONS' || method === 'HEAD') continue;
      expressOps.add(operationKey(method, path));
    }
  }

  const registeredByKey = new Map<string, { migrationStatus: string }>();
  const duplicateRegistryKeys: string[] = [];
  for (const route of openApiRegistry.getRoutes()) {
    const key = operationKey(route.method, route.openApiPath);
    if (registeredByKey.has(key)) {
      duplicateRegistryKeys.push(key);
    } else {
      registeredByKey.set(key, route);
    }
  }

  const missingFromRegistry: string[] = [];
  const pendingOnly: string[] = [];
  for (const key of expressOps) {
    const registered = registeredByKey.get(key);
    if (!registered) {
      missingFromRegistry.push(key);
    } else if (registered.migrationStatus !== 'complete') {
      pendingOnly.push(key);
    }
  }

  const extraInRegistry = [...registeredByKey.keys()].filter((key) => !expressOps.has(key));

  return {
    expressOperationCount: expressOps.size,
    registeredOperationCount: registeredByKey.size,
    completeRegistrationCount: openApiRegistry.countByStatus('complete'),
    missingFromRegistry: missingFromRegistry.sort(),
    pendingOnly: pendingOnly.sort(),
    extraInRegistry: extraInRegistry.sort(),
    duplicateRegistryKeys: [...new Set(duplicateRegistryKeys)].sort(),
  };
}

export function formatCoverageReport(report: OpenApiCoverageReport): string {
  return [
    `Express operations:        ${report.expressOperationCount}`,
    `Registered operations:     ${report.registeredOperationCount}`,
    `Complete registrations:    ${report.completeRegistrationCount}`,
    `Missing from registry:     ${report.missingFromRegistry.length}`,
    `Pending (not complete):    ${report.pendingOnly.length}`,
    `Extra in registry only:    ${report.extraInRegistry.length}`,
    `Duplicate registry keys:   ${report.duplicateRegistryKeys.length}`,
  ].join('\n');
}
