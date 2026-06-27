import type { HttpMethod } from './types';

function toPascalCaseSegment(segment: string): string {
  return segment
    .replace(/^\{|\}$/g, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** e.g. POST /api/v1/auth/login → PostAuthLogin */
export function operationBaseName(method: HttpMethod, openApiPath: string): string {
  const pathWithoutPrefix = openApiPath.replace(/^\/api\/v1\/?/, '');
  const segments = pathWithoutPrefix
    .split('/')
    .filter(Boolean)
    .map(toPascalCaseSegment);
  const methodPrefix = method.charAt(0).toUpperCase() + method.slice(1);
  return methodPrefix + segments.join('');
}

export function requestBodySchemaName(method: HttpMethod, openApiPath: string): string {
  const base = operationBaseName(method, openApiPath);
  return base.endsWith('Request') ? base : `${base}Request`;
}

export function responseBodySchemaName(
  method: HttpMethod,
  openApiPath: string,
  status: number,
): string {
  return `${operationBaseName(method, openApiPath)}Response${status}`;
}

/** OpenAPI component name: alphanumeric only. */
export function sanitizeSchemaComponentName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned) {
    return 'Schema';
  }
  if (/^[0-9]/.test(cleaned)) {
    return `Schema${cleaned}`;
  }
  return cleaned;
}
