import {
  operationBaseName,
  requestBodySchemaName,
  responseBodySchemaName,
  sanitizeSchemaComponentName,
} from '@/openapi/schema-names';

describe('OpenAPI schema names', () => {
  it('builds operation base names from method and path', () => {
    expect(operationBaseName('post', '/api/v1/auth/login')).toBe('PostAuthLogin');
    expect(operationBaseName('get', '/api/v1/facilities/{id}')).toBe('GetFacilitiesId');
  });

  it('builds request and response schema names', () => {
    expect(requestBodySchemaName('post', '/api/v1/facilities')).toBe('PostFacilitiesRequest');
    expect(requestBodySchemaName('post', '/api/v1/auth/forgot-password/request')).toBe(
      'PostAuthForgotPasswordRequest',
    );
    expect(responseBodySchemaName('post', '/api/v1/facilities', 201)).toBe('PostFacilitiesResponse201');
  });

  it('sanitizes component names', () => {
    expect(sanitizeSchemaComponentName('PostAuthLoginRequest')).toBe('PostAuthLoginRequest');
    expect(sanitizeSchemaComponentName('201')).toBe('Schema201');
  });
});
