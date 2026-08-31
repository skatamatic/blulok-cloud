export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type OpenApiRouteConfig = {
  openApiPath: string;
  tags: string[];
  summary?: string;
  description?: string;
  security?: 'bearer' | 'none';
  params?: import('joi').ObjectSchema;
  query?: import('joi').ObjectSchema;
  body?: import('joi').ObjectSchema;
  responses?: Record<number, import('joi').ObjectSchema | undefined>;
  /** Return { message: 'Validation error', errors: string[] } on 400 (legacy units routes). */
  legacyValidationErrors?: boolean;
};
