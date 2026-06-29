import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { createApp } from '@/app';

const specPath = join(__dirname, '../../../openapi/generated.json');

describe('OpenAPI contract smoke tests', () => {
  let app: ReturnType<typeof createApp>;
  let spec: { paths: Record<string, Record<string, unknown>> };

  beforeAll(() => {
    app = createApp();
    try {
      spec = JSON.parse(readFileSync(specPath, 'utf-8')) as typeof spec;
    } catch {
      spec = { paths: {} };
    }
  });

  it('generated spec exists and defines core public paths', () => {
    expect(spec.paths['/auth/login']?.post).toBeDefined();
    expect(spec.paths['/health']?.get).toBeDefined();
  });

  it('POST /api/v1/auth/login matches documented error envelope on bad input', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({});
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: expect.any(String),
    });
  });

  it('GET /health returns 200 as documented', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
  });

  it('GET /api/openapi.json is available', async () => {
    const response = await request(app).get('/api/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('openapi');
    expect(response.body).toHaveProperty('paths');
    expect(Object.keys(response.body.paths as object).length).toBeGreaterThan(100);
  });

  it('GET /api/docs serves Swagger UI when enabled', async () => {
    const response = await request(app).get('/api/docs/');
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/swagger/i);
  });
});
