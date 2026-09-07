import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import type { ObjectSchema } from 'joi';
import { openApiRegistry } from './registry';
import type { HttpMethod, OpenApiRouteConfig } from './types';

function buildValidator(
  schema: ObjectSchema,
  property: 'body' | 'query' | 'params',
  legacyValidationErrors = false,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const target = req as unknown as Record<string, unknown>;
    const { error, value } = schema.validate(target[property], {
      convert: true,
      abortEarly: false,
      stripUnknown: false,
    });
    if (error) {
      const body: Record<string, unknown> = { success: false };
      if (legacyValidationErrors) {
        body.message = 'Validation error';
        body.errors = error.details.map((detail) => detail.message);
      } else {
        body.message = error.details?.[0]?.message || 'Validation error';
      }
      res.status(400).json(body);
      return;
    }
    target[property] = value;
    next();
  };
}

function buildValidationMiddleware(config: OpenApiRouteConfig): RequestHandler[] {
  const middleware: RequestHandler[] = [];
  const legacy = config.legacyValidationErrors === true;
  if (config.params) middleware.push(buildValidator(config.params, 'params', legacy));
  if (config.query) middleware.push(buildValidator(config.query, 'query', legacy));
  if (config.body) middleware.push(buildValidator(config.body, 'body', legacy));
  return middleware;
}

function registerRouteMethod(
  method: HttpMethod,
  router: Router,
  path: string,
  config: OpenApiRouteConfig,
  ...handlers: RequestHandler[]
): void {
  const validation = buildValidationMiddleware(config);
  const routeHandler = handlers[handlers.length - 1];
  const middleware = handlers.slice(0, -1);
  const allHandlers = routeHandler
    ? [...middleware, ...validation, routeHandler]
    : [...middleware, ...validation];

  openApiRegistry.register({
    method,
    openApiPath: config.openApiPath,
    tags: config.tags,
    summary: config.summary,
    description: config.description,
    security: config.security,
    params: config.params,
    query: config.query,
    body: config.body,
    responses: config.responses,
    migrationStatus: 'complete',
  });

  switch (method) {
    case 'get':
      router.get(path, ...allHandlers);
      break;
    case 'post':
      router.post(path, ...allHandlers);
      break;
    case 'put':
      router.put(path, ...allHandlers);
      break;
    case 'patch':
      router.patch(path, ...allHandlers);
      break;
    case 'delete':
      router.delete(path, ...allHandlers);
      break;
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }
}

export function registerGet(
  router: Router,
  path: string,
  config: OpenApiRouteConfig,
  ...handlers: RequestHandler[]
): void {
  registerRouteMethod('get', router, path, config, ...handlers);
}

export function registerPost(
  router: Router,
  path: string,
  config: OpenApiRouteConfig,
  ...handlers: RequestHandler[]
): void {
  registerRouteMethod('post', router, path, config, ...handlers);
}

export function registerPut(
  router: Router,
  path: string,
  config: OpenApiRouteConfig,
  ...handlers: RequestHandler[]
): void {
  registerRouteMethod('put', router, path, config, ...handlers);
}

export function registerPatch(
  router: Router,
  path: string,
  config: OpenApiRouteConfig,
  ...handlers: RequestHandler[]
): void {
  registerRouteMethod('patch', router, path, config, ...handlers);
}

export function registerDelete(
  router: Router,
  path: string,
  config: OpenApiRouteConfig,
  ...handlers: RequestHandler[]
): void {
  registerRouteMethod('delete', router, path, config, ...handlers);
}

/** Register OpenAPI metadata for routes that still use raw router.* during migration. */
export function registerOpenApiOnly(config: OpenApiRouteConfig & { method: HttpMethod }): void {
  openApiRegistry.register({
    method: config.method,
    openApiPath: config.openApiPath,
    tags: config.tags,
    summary: config.summary,
    description: config.description,
    security: config.security,
    params: config.params,
    query: config.query,
    body: config.body,
    responses: config.responses,
    migrationStatus: 'complete',
  });
}
