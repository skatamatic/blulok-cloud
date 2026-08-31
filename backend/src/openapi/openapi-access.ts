import { config } from '@/config/environment';

/** Interactive Swagger UI at /api/docs (enabled by default; set ENABLE_OPENAPI_DOCS=false to disable). */
export function isOpenApiSwaggerUiEnabled(): boolean {
  return config.enableOpenApiDocs;
}
