import { Router, Response, Request } from 'express';
import express from 'express';
import Joi from 'joi';
import { authenticateToken, requireRoles } from '@/middleware/auth.middleware';
import { UserRole, AuthenticatedRequest } from '@/types/auth.types';
import { asyncHandler } from '@/middleware/error.middleware';
import { FacilityProvisioningService, sanitizeContentDispositionFilename } from '@/services/provisioning/facility-provisioning.service';
import { PROVISIONING_MAX_SIZE_BYTES } from '@/constants/provisioning.constants';
import type { FacilityProvisioningUploadSource } from '@/models/facility-provisioning-file.model';

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

const prepareSchema = Joi.object({
  filename: Joi.string().trim().required(),
  size_bytes: Joi.number().integer().positive().required(),
  content_type: Joi.string().trim().max(255).optional(),
});

const completeSchema = Joi.object({
  upload_id: Joi.string().uuid().required(),
  filename: Joi.string().trim().required(),
  size_bytes: Joi.number().integer().positive().required(),
  content_type: Joi.string().trim().max(255).optional(),
});

const directUploadRouter = Router({ mergeParams: true });

// PUT /api/v1/facilities/:facilityId/provisioning-data/direct-upload/:uploadId
// Token-only auth (no Bearer JWT) — mirrors GCS resumable upload for local dev.
// Mounted from facilities.routes BEFORE parent authenticateToken.
directUploadRouter.put(
  '/direct-upload/:uploadId',
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

// GET /api/v1/facilities/:facilityId/provisioning-data
router.get(
  '/',
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

// POST /api/v1/facilities/:facilityId/provisioning-data/prepare
router.post(
  '/prepare',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    if (!(await assertFacilityAccess(req, res, facilityId))) return;

    const { error, value } = prepareSchema.validate(req.body);
    if (error) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }

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

// POST /api/v1/facilities/:facilityId/provisioning-data/complete
router.post(
  '/complete',
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const facilityId = String(req.params.facilityId);
    if (!(await assertFacilityAccess(req, res, facilityId))) return;

    const { error, value } = completeSchema.validate(req.body);
    if (error) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }

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

// GET /api/v1/facilities/:facilityId/provisioning-data/:fileId/download
router.get(
  '/:fileId/download',
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

// DELETE /api/v1/facilities/:facilityId/provisioning-data/:fileId
router.delete(
  '/:fileId',
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
