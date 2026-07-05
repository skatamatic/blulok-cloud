import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/error.middleware';
import { FMSService } from '@/services/fms/fms.service';
import { logger } from '@/utils/logger';
import { registerOpenApiOnly } from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import { fmsFacilityIdParamSchema, fmsWebhookResponseSchema } from '@/schemas/fms.schemas';

registerOpenApiOnly({
  method: 'post',
  openApiPath: '/api/v1/fms/webhook/{facilityId}',
  tags: ['FMS'],
  summary: 'Webhook receiver for FMS events',
  description:
    'Public FMS CloudEvents receiver. Auth mode is configured per facility (HMAC signature, shared header secret, or none).',
  security: 'none',
  params: fmsFacilityIdParamSchema,
  responses: {
    200: fmsWebhookResponseSchema,
    400: errorEnvelopeSchema,
    401: errorEnvelopeSchema,
    404: errorEnvelopeSchema,
    500: errorEnvelopeSchema,
  },
});

const router = Router();

/**
 * Public webhook receiver for Storable Edge CloudEvents.
 * Mounted with express.raw() in app.ts before JSON body parser.
 */
router.post(
  '/:facilityId',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const facilityId = req.params.facilityId;
    const rawBody = req.body as Buffer;

    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ success: false, message: 'Empty webhook body' });
      return;
    }

    try {
      const result = await FMSService.getInstance().handleWebhookEvent(
        facilityId,
        rawBody,
        req.headers as Record<string, string | string[] | undefined>
      );

      if (result.duplicate) {
        res.status(200).json({ success: true, message: 'Event already processed', duplicate: true });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message,
        syncLogId: result.syncLogId,
        changesDetected: result.changesDetected,
        changesApplied: result.changesApplied,
        requiresReview: result.requiresReview,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('[FMS Webhook] Processing failed', { facilityId, error: message });

      if (message.includes('Invalid webhook signature')) {
        res.status(401).json({ success: false, message });
        return;
      }
      if (message.includes('not found') || message.includes('not enabled')) {
        res.status(404).json({ success: false, message });
        return;
      }
      if (message.includes('Facility ID mismatch')) {
        res.status(400).json({ success: false, message });
        return;
      }

      res.status(500).json({ success: false, message: 'Failed to process webhook event' });
    }
  })
);

export { router as fmsWebhookRouter };
