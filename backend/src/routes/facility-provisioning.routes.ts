import { Router, Response, Request } from 'express';
import express from 'express';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { UserRole, AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { FacilityProvisioningService, sanitizeContentDispositionFilename } from '@/services/provisioning/facility-provisioning.service';
import { PROVISIONING_MAX_SIZE_BYTES } from '@/constants/provisioning.constants';
import type { FacilityProvisioningUploadSource } from '@/models/facility-provisioning-file.model';
import { registerGet, registerPost, registerPut, registerDelete } from '@/openapi/register-route';
import { errorEnvelopeSchema, successEnvelopeSchema } from '@/openapi/common-schemas';
import {
  facilityIdParamSchema,
  provisioningFileIdParamSchema,
  directUploadParamSchema,
  provisioningListQuerySchema,
  prepareUploadSchema,
  completeUploadSchema,
  provisioningListResponseSchema,
  prepareUploadResponseSchema,
  completeUploadResponseSchema,
  deleteProvisioningFileResponseSchema,
} from '@/schemas/facility-provisioning.schemas';

const MOUNT = '/api/v1/facilities/{facilityId}/provisioning-data';

async function assertFacilityAccess(
  req: AuthenticatedRequest,
  res: Response,
  facilityId: string,
): Promise<boolean> {
  if (req.user?.role === UserRole.FACILITY_ADMIN) {
    const allowed = req.user.facilityIds || [];
    if (!allowed.includes(facilityId)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return false;
    }
  }
  return true;
}

function resolveUploadSource(req: AuthenticatedRequest): FacilityProvisioningUploadSource {
  const appDeviceId = (req.headers['x-app-device-id'] as string | undefined)?.trim();
  return appDeviceId ? 'app' : 'dashboard';
}

const directUploadRouter = Router({ mergeParams: true });

// PUT /api/v1/facilities/:facilityId/provisioning-data/direct-upload/:uploadId
// Token-only auth (no Bearer JWT) — mirrors GCS resumable upload for local dev.
// Mounted from facilities.routes BEFORE parent authenticateToken.
registerPut(
  directUploadRouter,
  '/direct-upload/:uploadId',
  {
    openApiPath: `${MOUNT}/direct-upload/{uploadId}`,
    tags: ['Facilities', 'App'],
    summary: 'Upload provisioning file bytes with upload token',
    security: 'none',
    params: directUploadParamSchema,
    responses: {
      200: successEnvelopeSchema,
      400: errorEnvelopeSchema,
      401: errorEnvelopeSchema,
    },
  },
  express.raw({ type: '*/*', limit: PROVISIONING_MAX_SIZE_BYTES }),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    const uploadId = String(req.params.uploadId);
    const uploadToken =
      req.header('x-provisioning-upload-token') || req.header('X-Provisioning-Upload-Token');
    if (!uploadToken) {
      res.status(401).json({ success: false, message: 'Missing provisioning upload token' });
      return;
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ success: false, message: 'Empty upload body' });
      return;
    }

    try {
      await FacilityProvisioningService.receiveDirectUpload(facilityId, uploadId, uploadToken, body);
      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err?.message || 'Failed to store upload' });
    }
  }),
);

const router = Router({ mergeParams: true });

router.use(authenticateToken);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Facilities', 'App'],
    summary: 'List provisioning data files for a facility',
    security: 'bearer',
    params: facilityIdParamSchema,
    query: provisioningListQuerySchema,
    responses: {
      200: provisioningListResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    if (!(await assertFacilityAccess(req, res, facilityId))) return;

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    const result = await FacilityProvisioningService.listFiles(facilityId, limit, offset);
    res.json({ success: true, data: result });
  }),
);

registerPost(
  router,
  '/prepare',
  {
    openApiPath: `${MOUNT}/prepare`,
    tags: ['Facilities', 'App'],
    summary: 'Prepare a provisioning data upload session',
    security: 'bearer',
    params: facilityIdParamSchema,
    body: prepareUploadSchema,
    responses: {
      200: prepareUploadResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    if (!(await assertFacilityAccess(req, res, facilityId))) return;

    const value = req.body;

    try {
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
      const session = await FacilityProvisioningService.prepareUpload(
        facilityId,
        value.filename,
        value.size_bytes,
        value.content_type,
        origin,
      );
      res.json({ success: true, data: session });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err?.message || 'Failed to prepare upload' });
    }
  }),
);

registerPost(
  router,
  '/complete',
  {
    openApiPath: `${MOUNT}/complete`,
    tags: ['Facilities', 'App'],
    summary: 'Complete a provisioning data upload',
    security: 'bearer',
    params: facilityIdParamSchema,
    body: completeUploadSchema,
    responses: {
      200: completeUploadResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    if (!(await assertFacilityAccess(req, res, facilityId))) return;

    const value = req.body;

    try {
      const file = await FacilityProvisioningService.completeUpload(
        facilityId,
        value.upload_id,
        value.filename,
        value.size_bytes,
        resolveUploadSource(req),
        req.user!.userId,
        value.content_type,
      );
      res.json({ success: true, data: { file } });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err?.message || 'Failed to complete upload' });
    }
  }),
);

registerGet(
  router,
  '/:fileId/download',
  {
    openApiPath: `${MOUNT}/{fileId}/download`,
    tags: ['Facilities', 'App'],
    summary: 'Download a provisioning data file',
    security: 'bearer',
    params: provisioningFileIdParamSchema,
    responses: {
      404: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    const fileId = String(req.params.fileId);
    if (!(await assertFacilityAccess(req, res, facilityId))) return;

    try {
      const { buffer, filename, content_type, size_bytes } =
        await FacilityProvisioningService.streamDownload(fileId, facilityId);
      res.setHeader('Content-Type', content_type);
      res.setHeader('Content-Length', String(size_bytes));
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeContentDispositionFilename(filename)}"`);
      res.send(buffer);
    } catch (err: any) {
      res.status(404).json({ success: false, message: err?.message || 'File not found' });
    }
  }),
);

registerDelete(
  router,
  '/:fileId',
  {
    openApiPath: `${MOUNT}/{fileId}`,
    tags: ['Facilities', 'App'],
    summary: 'Delete a provisioning data file',
    security: 'bearer',
    params: provisioningFileIdParamSchema,
    responses: {
      200: deleteProvisioningFileResponseSchema,
      404: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    const fileId = String(req.params.fileId);
    if (!(await assertFacilityAccess(req, res, facilityId))) return;

    const file = await FacilityProvisioningService.getFile(fileId);
    if (!file || file.facility_id !== facilityId) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }

    const deleted = await FacilityProvisioningService.deleteFile(fileId);
    res.json({ success: true, deleted });
  }),
);

export { router as facilityProvisioningRouter, directUploadRouter as facilityProvisioningDirectUploadRouter };
