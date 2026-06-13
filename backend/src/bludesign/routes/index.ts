/**
 * BluDesign Routes Index
 * 
 * Aggregates all BluDesign routes.
 */

import { Router } from 'express';
import { bluDesignProjectsRouter } from './projects.routes';
import { bluDesignAssetsRouter } from './assets.routes';
import { bluDesignAssetDefinitionsRouter } from './asset-definitions.routes';
import userFacilitiesRouter from './facilities.routes'; // User-based save/load system
import { bluDesignThemesRouter } from './themes.routes';
import { bluDesignSkinsRouter } from './skins.routes';
import { storageRouter } from './storage.routes';
import { bluDesignLayoutImportRouter } from './layout-import.routes';

const router = Router();

// User facilities (simpler save/load system for quick workflow)
router.use('/facilities', userFacilitiesRouter);

// Themes and skins
router.use('/themes', bluDesignThemesRouter);
router.use('/skins', bluDesignSkinsRouter);

// Global asset definitions, material presets, and custom models
router.use('/assets', bluDesignAssetDefinitionsRouter);

// Mount project routes
router.use('/projects', bluDesignProjectsRouter);

// Project-specific asset routes
router.use('/projects/:projectId/assets', bluDesignAssetsRouter);

// Storage provider routes (OAuth, testing, etc.)
router.use('/storage', storageRouter);

// Layout import: image → detected unit candidates
router.use('/layout-import', bluDesignLayoutImportRouter);

export { router as bluDesignRouter };

