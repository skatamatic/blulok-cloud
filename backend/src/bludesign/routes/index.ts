/**
 * BluDesign Routes Index
 * 
 * Aggregates all BluDesign routes.
 */

import { Router } from 'express';
import { bluDesignProjectsRouter } from './projects.routes';
import { bluDesignAssetsRouter } from './assets.routes';
import userFacilitiesRouter from './facilities.routes'; // User-based save/load system
import { bluDesignThemesRouter } from './themes.routes';
import { bluDesignSkinsRouter } from './skins.routes';

const router = Router();

// User facilities (simpler save/load system for quick workflow)
router.use('/facilities', userFacilitiesRouter);

// Themes and skins
router.use('/themes', bluDesignThemesRouter);
router.use('/skins', bluDesignSkinsRouter);

// Mount project routes
router.use('/projects', bluDesignProjectsRouter);

// Nested routes under projects
router.use('/projects/:projectId/assets', bluDesignAssetsRouter);
// Note: Project-level facilities route will be added later

export { router as bluDesignRouter };

