import type { ObjectSchema } from 'joi';
import { sanitizeSchemaComponentName } from './schema-names';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const j2s = require('joi-to-swagger') as (
  schema: ObjectSchema,
  existingComponents?: Record<string, unknown>,
) => { swagger: Record<string, unknown>; components?: Record<string, unknown> };

let activeSchemaRegistry = new WeakMap<ObjectSchema, string>();
const metaNameRegistry = new Map<string, string>();
const usedComponentNames = new Set<string>();

export function resetJoiConverterState(): void {
  activeSchemaRegistry = new WeakMap<ObjectSchema, string>();
  metaNameRegistry.clear();
  usedComponentNames.clear();
}

function readMetaOpenApiName(schema: ObjectSchema): string | undefined {
  const metas = schema.describe().metas as Array<{ openapiName?: string }> | undefined;
  if (!metas?.length) {
    return undefined;
  }
  for (const meta of metas) {
    if (typeof meta.openapiName === 'string' && meta.openapiName.trim()) {
      return meta.openapiName.trim();
    }
  }
  return undefined;
}

function componentKey(schemaName: string): string {
  return `#/components/schemas/${schemaName}`;
}

function allocateUniqueName(preferred: string, components: Record<string, unknown>): string {
  const base = sanitizeSchemaComponentName(preferred);
  let candidate = base;
  let suffix = 2;
  while (usedComponentNames.has(candidate) || components[componentKey(candidate)] !== undefined) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  usedComponentNames.add(candidate);
  return candidate;
}

export function joiSchemaToOpenApi(
  schema: ObjectSchema | undefined,
  nameHint: string,
  components: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!schema) return undefined;

  const existingName = activeSchemaRegistry.get(schema);
  if (existingName) {
    return { $ref: `#/components/schemas/${existingName}` };
  }

  const metaName = readMetaOpenApiName(schema);
  if (metaName) {
    const metaKey = sanitizeSchemaComponentName(metaName);
    const registered = metaNameRegistry.get(metaKey);
    if (registered) {
      activeSchemaRegistry.set(schema, registered);
      return { $ref: `#/components/schemas/${registered}` };
    }
  }

  const schemaName = allocateUniqueName(metaName ?? nameHint, components);
  const { swagger, components: newComponents } = j2s(schema, components);

  if (newComponents) {
    Object.assign(components, newComponents);
  }

  if (swagger.$ref) {
    return { $ref: swagger.$ref };
  }

  components[componentKey(schemaName)] = swagger;
  activeSchemaRegistry.set(schema, schemaName);
  if (metaName) {
    metaNameRegistry.set(sanitizeSchemaComponentName(metaName), schemaName);
  }
  return { $ref: `#/components/schemas/${schemaName}` };
}
