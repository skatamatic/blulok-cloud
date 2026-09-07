/**
 * BluDesign Layout Import Routes
 *
 * Runs the detection engine on an uploaded site-plan image and returns
 * pixel-space unit candidates. Synchronous for now (no persistence / job
 * queue): the wizard fetches candidates, the human verifies/edits them, and a
 * later phase converts them into placed objects.
 */

import { Router, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { authenticateToken } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { AuthenticatedRequest } from '@/types/auth.types';
import { detectUnits } from '../layout-import';
import type { DetectionOptions, DetectionEvent } from '../layout-import';
import { registerPost } from '@/openapi/register-route';

const router = Router();
const MOUNT = '/api/v1/bludesign/layout-import';

interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    if (
      ALLOWED_MIMES.includes(file.mimetype) ||
      file.originalname.match(/\.(png|jpg|jpeg|webp)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type: expected PNG, JPEG or WEBP'));
    }
  },
});

router.use(authenticateToken as any);

/**
 * POST /detect
 * Detect storage-unit candidates in an uploaded site-plan image.
 * Body: multipart/form-data with `file`. Optional JSON `options` field with a
 * partial DetectionOptions object (tuning knobs).
 */
registerPost(
  router,
  '/detect',
  {
    openApiPath: `${MOUNT}/detect`,
    tags: ['BluDesign'],
    summary: 'Detect storage-unit candidates in a site-plan image',
    security: 'bearer',
  },
  upload.single('file'),
  asyncHandler(async (req: MulterRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    let options: DetectionOptions | undefined;
    if (typeof req.body?.options === 'string' && req.body.options.trim()) {
      try {
        options = JSON.parse(req.body.options) as DetectionOptions;
      } catch {
        res
          .status(400)
          .json({ success: false, message: 'Invalid options JSON' });
        return;
      }
    }

    const result = await detectUnits(file.buffer, options);
    res.json({ success: true, data: result });
  }),
);

/** Parse the optional JSON `options` multipart field, or throw on bad JSON. */
function parseOptions(raw: unknown): DetectionOptions | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return JSON.parse(raw) as DetectionOptions;
}

/**
 * POST /detect/stream
 * Same detection as POST /detect, but streams granular progress as
 * newline-delimited JSON ({@link DetectionEvent}s) so the client can render
 * stage progress and draw candidate boxes as they are discovered. The terminal
 * event is `{ type: 'done', result }` or `{ type: 'error', message }`.
 */
registerPost(
  router,
  '/detect/stream',
  {
    openApiPath: `${MOUNT}/detect/stream`,
    tags: ['BluDesign'],
    summary: 'Detect units with streaming NDJSON progress',
    security: 'bearer',
  },
  upload.single('file'),
  asyncHandler(async (req: MulterRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    let options: DetectionOptions | undefined;
    try {
      options = parseOptions(req.body?.options);
    } catch {
      res.status(400).json({ success: false, message: 'Invalid options JSON' });
      return;
    }

    // NDJSON stream. Disable proxy/middleware buffering so events flush live.
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const write = (event: DetectionEvent): void => {
      res.write(JSON.stringify(event) + '\n');
      // `compression` middleware adds flush(); call it so each event ships now.
      (res as unknown as { flush?: () => void }).flush?.();
    };

    try {
      const result = await detectUnits(file.buffer, options, { onEvent: write });
      write({ type: 'done', result });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Detection failed unexpectedly';
      write({ type: 'error', message });
    } finally {
      res.end();
    }
  }),
);

export { router as bluDesignLayoutImportRouter };
