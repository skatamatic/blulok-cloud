import type { RegisteredRoute } from './registry';
import { joiSchemaToOpenApi, resetJoiConverterState } from './joi-converter';
import { requestBodySchemaName, responseBodySchemaName } from './schema-names';

const OPENAPI_TAGS = [
  { name: 'Auth', description: 'Authentication and session management' },
  { name: 'App', description: 'Mobile app / manager-mode APIs' },
  { name: 'Facilities', description: 'Facility management and provisioning' },
  { name: 'Units', description: 'Storage unit management' },
  { name: 'Devices', description: 'BluLok locks and access control devices' },
  { name: 'Gateway', description: 'Gateway management and telemetry' },
  { name: 'GatewayInternal', description: 'Internal gateway firmware APIs' },
  { name: 'Admin', description: 'Administration and dev tools' },
  { name: 'FMS', description: 'Facility management system integration' },
  { name: 'BluDesign', description: '3D facility design editor' },
  { name: 'System', description: 'Health checks and system settings' },
  { name: 'AccessControl', description: 'Facility access control device queries' },
  { name: 'Activity', description: 'Activity logging' },
  { name: 'Notifications', description: 'User notifications' },
  { name: 'AccessHistory', description: 'Access history and audit logs' },
  { name: 'KeySharing', description: 'Key sharing between users' },
  { name: 'Schedules', description: 'Access schedules' },
  { name: 'AccessCodes', description: 'Keypad access codes' },
  { name: 'Firmware', description: 'Firmware OTA updates' },
  { name: 'Users', description: 'User management' },
  { name: 'Dashboard', description: 'Dashboard widgets and layouts' },
  { name: 'Commands', description: 'Device commands' },
  { name: 'Denylist', description: 'User denylist management' },
  { name: 'Passes', description: 'Route passes and JWT passes' },
];

const OPENAPI_SERVER_BASE = '/api/v1';

/** Strip the server base prefix so Swagger resolves `/api/v1` + `/facilities/...` correctly. */
export function openApiPathRelativeToServer(fullPath: string): string {
  if (fullPath === OPENAPI_SERVER_BASE) {
    return '/';
  }
  if (fullPath.startsWith(`${OPENAPI_SERVER_BASE}/`)) {
    return fullPath.slice(OPENAPI_SERVER_BASE.length);
  }
  return fullPath;
}

function expressPathToOpenApi(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function buildOperation(route: RegisteredRoute, components: Record<string, unknown>) {
  const parameters: Record<string, unknown>[] = [];

  if (route.params) {
    const paramSchema = route.params.describe().keys as Record<string, { flags?: { presence?: string } }>;
    for (const [name, meta] of Object.entries(paramSchema)) {
      parameters.push({
        name,
        in: 'path',
        required: meta.flags?.presence === 'required',
        schema: { type: 'string', format: name.toLowerCase().includes('id') ? 'uuid' : undefined },
      });
    }
  }

  if (route.query) {
    const queryDesc = route.query.describe().keys as Record<string, unknown>;
    for (const name of Object.keys(queryDesc)) {
      parameters.push({
        name,
        in: 'query',
        required: false,
        schema: { type: 'string' },
      });
    }
  }

  const requestBody = route.body
    ? {
        required: true,
        content: {
          'application/json': {
            schema: joiSchemaToOpenApi(
              route.body,
              requestBodySchemaName(route.method, route.openApiPath),
              components,
            ),
          },
        },
      }
    : undefined;

  const responses: Record<string, unknown> = {};
  if (route.responses && Object.keys(route.responses).length > 0) {
    for (const [status, schema] of Object.entries(route.responses)) {
      if (!schema) continue;
      responses[status] = {
        description: `HTTP ${status}`,
        content: {
          'application/json': {
            schema: joiSchemaToOpenApi(
              schema,
              responseBodySchemaName(route.method, route.openApiPath, Number(status)),
              components,
            ),
          },
        },
      };
    }
  } else {
    responses['200'] = { description: 'Success' };
    responses['400'] = { description: 'Validation error' };
    responses['401'] = { description: 'Unauthorized' };
    responses['403'] = { description: 'Forbidden' };
    responses['404'] = { description: 'Not found' };
    responses['500'] = { description: 'Server error' };
  }

  const operation: Record<string, unknown> = {
    tags: route.tags,
    summary: route.summary,
    description: route.description,
    parameters: parameters.length > 0 ? parameters : undefined,
    requestBody,
    responses,
    'x-migration-status': route.migrationStatus,
  };

  if (route.security === 'bearer') {
    operation.security = [{ bearerAuth: [] }];
  } else if (route.security === 'none') {
    operation.security = [];
  }

  return operation;
}

export function buildOpenApiDocument(
  registeredRoutes: RegisteredRoute[],
  pendingRoutes: Array<{ method: string; path: string }> = [],
): Record<string, unknown> {
  resetJoiConverterState();
  const components: Record<string, unknown> = {};
  const paths: Record<string, Record<string, unknown>> = {};

  const registeredPathKeys = new Set(
    registeredRoutes.map((r) => `${r.method.toUpperCase()} ${r.openApiPath}`),
  );

  for (const route of registeredRoutes) {
    const pathKey = openApiPathRelativeToServer(route.openApiPath);
    if (!paths[pathKey]) {
      paths[pathKey] = {};
    }
    paths[pathKey][route.method] = buildOperation(route, components);
  }

  for (const pending of pendingRoutes) {
    const openApiPath = openApiPathRelativeToServer(expressPathToOpenApi(pending.path));
    const key = `${pending.method.toUpperCase()} ${openApiPath}`;
    if (registeredPathKeys.has(key)) continue;
    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }
    if (paths[openApiPath][pending.method.toLowerCase()]) continue;

    paths[openApiPath][pending.method.toLowerCase()] = {
      tags: ['System'],
      summary: `${pending.method.toUpperCase()} ${openApiPath}`,
      responses: {
        '200': { description: 'Success' },
        '401': { description: 'Unauthorized' },
        '500': { description: 'Server error' },
      },
      'x-migration-status': 'pending',
    };
  }

  const schemas: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(components)) {
    const match = key.match(/#\/components\/schemas\/(.+)/);
    if (match) {
      schemas[match[1]] = value;
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'BluLok Cloud API',
      version: '1.0.0',
      description:
        'BluLok Cloud REST API. Interactive docs at /api/docs (default). Raw spec at /api/openapi.json. Set ENABLE_OPENAPI_DOCS=false to hide Swagger UI.',
    },
    servers: [{ url: OPENAPI_SERVER_BASE, description: 'API v1 base (relative to host root)' }],
    tags: OPENAPI_TAGS,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT from POST /api/v1/auth/login',
        },
      },
      schemas,
    },
  };
}
