/**
 * FMS webhook route — public endpoint without JWT.
 */

import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { fmsWebhookRouter } from '@/routes/fms-webhook.routes';

jest.mock('@/services/fms/fms.service', () => ({
  FMSService: {
    getInstance: jest.fn(),
  },
}));

import { FMSService } from '@/services/fms/fms.service';

const facilityId = '550e8400-e29b-41d4-a716-446655440011';

function buildApp() {
  const app = express();
  app.use(
    '/api/v1/fms/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    fmsWebhookRouter
  );
  return app;
}

describe('POST /api/v1/fms/webhook/:facilityId', () => {
  const handleWebhookEvent = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (FMSService.getInstance as jest.Mock).mockReturnValue({ handleWebhookEvent });
  });

  it('accepts webhook without Authorization header', async () => {
    handleWebhookEvent.mockResolvedValue({
      duplicate: false,
      message: 'ok',
      syncLogId: 'sync-1',
      changesDetected: 1,
      changesApplied: 1,
      requiresReview: false,
    });

    const body = JSON.stringify({
      id: 'evt-public',
      type: 'com.storedge.tenant.updated.v1',
      body: { facility_id: 'ext-fac', tenant_id: 't1' },
    });

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .set('X-Storable-Signature', 'sig')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(handleWebhookEvent).toHaveBeenCalledWith(
      facilityId,
      expect.any(Buffer),
      expect.objectContaining({ 'x-storable-signature': 'sig' })
    );
  });

  it('returns 401 when signature invalid', async () => {
    handleWebhookEvent.mockRejectedValue(new Error('Invalid webhook signature'));

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt-bad' }));

    expect(res.status).toBe(401);
  });

  it('returns 200 for duplicate events', async () => {
    handleWebhookEvent.mockResolvedValue({
      duplicate: true,
      message: 'Event already processed',
    });

    const res = await request(buildApp())
      .post(`/api/v1/fms/webhook/${facilityId}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt-dup' }));

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });
});
