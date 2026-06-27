import { createApp } from '@/app';
import { openApiRegistry } from '@/openapi/registry';
import { buildOpenApiDocument } from '@/openapi/document';
import { joiSchemaToOpenApi, resetJoiConverterState } from '@/openapi/joi-converter';
import {
  errorEnvelopeSchema,
  successEnvelopeSchema,
  paginationQuerySchema,
} from '@/openapi/common-schemas';
import { loginSchema } from '@/schemas/auth.schemas';

describe('OpenAPI registry integration', () => {
  it('has registered routes after app modules load', () => {
    createApp();
    expect(openApiRegistry.getRoutes().length).toBeGreaterThan(200);
  });
});

describe('OpenAPI registry unit', () => {
  beforeEach(() => {
    openApiRegistry.clear();
    resetJoiConverterState();
  });

  it('builds a document with bearer security scheme', () => {
    const doc = buildOpenApiDocument([]) as {
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('converts Joi schemas to OpenAPI component refs', () => {
    const components: Record<string, unknown> = {};
    const ref = joiSchemaToOpenApi(loginSchema, 'PostAuthLoginRequest', components);
    expect(ref).toEqual({ $ref: '#/components/schemas/PostAuthLoginRequest' });
    expect(Object.keys(components).length).toBeGreaterThan(0);
  });

  it('reuses shared envelope schemas under stable component names', () => {
    const components: Record<string, unknown> = {};
    const ref1 = joiSchemaToOpenApi(errorEnvelopeSchema, 'IgnoredHint', components);
    const ref2 = joiSchemaToOpenApi(errorEnvelopeSchema, 'AnotherHint', components);
    expect(ref1).toEqual({ $ref: '#/components/schemas/ErrorEnvelope' });
    expect(ref2).toEqual(ref1);
  });

  it('names operation schemas from route path and method', () => {
    openApiRegistry.register({
      method: 'post',
      openApiPath: '/api/v1/auth/login',
      tags: ['Auth'],
      security: 'none',
      body: loginSchema,
      responses: { 200: successEnvelopeSchema, 400: errorEnvelopeSchema },
      migrationStatus: 'complete',
    });

    const doc = buildOpenApiDocument(openApiRegistry.getRoutes()) as {
      paths: Record<string, Record<string, { requestBody?: { content: { 'application/json': { schema: { $ref: string } } } } }>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(doc.paths['/api/v1/auth/login']?.post?.requestBody?.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/PostAuthLoginRequest',
    );
    expect(doc.components.schemas.PostAuthLoginRequest).toBeDefined();
    expect(doc.components.schemas.ErrorEnvelope).toBeDefined();
    expect(doc.components.schemas.RequestBody_1).toBeUndefined();
  });

  it('normalizes express paths to OpenAPI path params in pending merge', () => {
    const doc = buildOpenApiDocument([], [
      { method: 'get', path: '/api/v1/facilities/:facilityId/units' },
    ]) as { paths: Record<string, unknown> };
    expect(doc.paths['/api/v1/facilities/{facilityId}/units']).toBeDefined();
  });

  it('registers complete routes without pending status in merged output', () => {
    openApiRegistry.register({
      method: 'get',
      openApiPath: '/api/v1/units',
      tags: ['Units'],
      security: 'bearer',
      query: paginationQuerySchema,
      responses: { 200: successEnvelopeSchema, 403: errorEnvelopeSchema },
      migrationStatus: 'complete',
    });

    const doc = buildOpenApiDocument(openApiRegistry.getRoutes()) as {
      paths: Record<string, Record<string, Record<string, string>>>;
    };
    const operation = doc.paths['/api/v1/units']?.get;
    expect(operation?.['x-migration-status']).toBe('complete');
  });
});
