import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { isOpenApiSwaggerUiEnabled } from '@/openapi/openapi-access';

const router = Router();

function resolveOpenApiSpecPath(): string {
  const candidates = [
    join(__dirname, '../../openapi/generated.json'),
    join(process.cwd(), 'dist/openapi/generated.json'),
    join(process.cwd(), 'openapi/generated.json'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function loadOpenApiSpec(): Record<string, unknown> {
  const specPath = resolveOpenApiSpecPath();
  try {
    return JSON.parse(readFileSync(specPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {
      openapi: '3.1.0',
      info: { title: 'BluLok Cloud API', version: '1.0.0' },
      paths: {},
    };
  }
}

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(loadOpenApiSpec());
});

if (isOpenApiSwaggerUiEnabled()) {
  const openApiDocument = loadOpenApiSpec();

  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'BluLok Cloud API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }),
  );
}

export { router as openApiDocsRouter };
