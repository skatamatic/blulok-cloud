/**
 * Storage Provider Integration Tests
 * 
 * End-to-end tests for storage providers with real storage backends.
 * These tests require actual GCS bucket or Google Drive folder access.
 * 
 * To run these tests:
 * - Set up test GCS bucket and service account
 * - Set up test Google Drive folder and OAuth credentials
 * - Set environment variables or skip tests if not configured
 */

import { createStorageProvider } from '@/bludesign/services/storage/storage.factory';
import { StorageProviderType } from '@/bludesign/types/bludesign.types';

describe('Storage Provider Integration Tests', () => {
  const TEST_PROJECT_ID = 'test-project-integration';
  const TEST_ASSET_ID = 'test-asset-integration';
  const TEST_FACILITY_ID = 'test-facility-integration';

  describe('Local Storage Provider', () => {
    it('should create, upload, download, and delete files', async () => {
      const provider = createStorageProvider({
        type: StorageProviderType.LOCAL,
        config: {
          basePath: './test-storage-integration',
        },
      });

      await provider.initialize();
      await provider.initializeProject(TEST_PROJECT_ID);

      // Upload file
      const testData = Buffer.from('test content');
      const filePath = await provider.uploadAssetFile(
        TEST_PROJECT_ID,
        TEST_ASSET_ID,
        'test.txt',
        testData,
        'text/plain'
      );
      expect(filePath).toBeDefined();

      // Download file
      const downloaded = await provider.downloadAssetFile(
        TEST_PROJECT_ID,
        TEST_ASSET_ID,
        'test.txt'
      );
      expect(downloaded.toString()).toBe('test content');

      // List files
      const files = await provider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      expect(files).toContain('test.txt');

      // Delete files
      await provider.deleteAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      const filesAfterDelete = await provider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      expect(filesAfterDelete).not.toContain('test.txt');

      // Cleanup
      await provider.deleteProject(TEST_PROJECT_ID);
    });
  });

  describe('GCS Storage Provider', () => {
    const gcsConfig = {
      bucketName: process.env.TEST_GCS_BUCKET,
      projectId: process.env.TEST_GCS_PROJECT_ID,
      keyFilePath: process.env.TEST_GCS_KEY_FILE,
      keyFileContents: process.env.TEST_GCS_KEY_CONTENTS,
    };

    const shouldSkip = !gcsConfig.bucketName || !gcsConfig.projectId;

    (shouldSkip ? it.skip : it)('should create, upload, download, and delete files', async () => {
      const provider = createStorageProvider({
        type: StorageProviderType.GCS,
        config: gcsConfig,
      });

      await provider.initialize();
      await provider.initializeProject(TEST_PROJECT_ID);

      // Upload file
      const testData = Buffer.from('test content');
      const filePath = await provider.uploadAssetFile(
        TEST_PROJECT_ID,
        TEST_ASSET_ID,
        'test.txt',
        testData,
        'text/plain'
      );
      expect(filePath).toBeDefined();

      // Download file
      const downloaded = await provider.downloadAssetFile(
        TEST_PROJECT_ID,
        TEST_ASSET_ID,
        'test.txt'
      );
      expect(downloaded.toString()).toBe('test content');

      // List files
      const files = await provider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      expect(files).toContain('test.txt');

      // Generate signed URL
      const signedUrl = await provider.getSignedUrl(
        TEST_PROJECT_ID,
        `assets/${TEST_ASSET_ID}/test.txt`,
        3600
      );
      expect(signedUrl).toBeDefined();
      expect(signedUrl).toContain('storage.googleapis.com');

      // Delete files
      await provider.deleteAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      const filesAfterDelete = await provider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      expect(filesAfterDelete).not.toContain('test.txt');

      // Cleanup
      await provider.deleteProject(TEST_PROJECT_ID);
    });
  });

  describe('Google Drive Storage Provider', () => {
    const gdriveConfig = {
      clientId: process.env.TEST_GDRIVE_CLIENT_ID,
      clientSecret: process.env.TEST_GDRIVE_CLIENT_SECRET,
      rootFolderId: process.env.TEST_GDRIVE_ROOT_FOLDER_ID,
      refreshToken: process.env.TEST_GDRIVE_REFRESH_TOKEN,
    };

    const shouldSkip = !gdriveConfig.clientId || !gdriveConfig.clientSecret || !gdriveConfig.rootFolderId;

    (shouldSkip ? it.skip : it)('should create, upload, download, and delete files', async () => {
      const provider = createStorageProvider({
        type: StorageProviderType.GDRIVE,
        config: gdriveConfig,
      });

      await provider.initialize();
      await provider.initializeProject(TEST_PROJECT_ID);

      // Upload file
      const testData = Buffer.from('test content');
      const fileId = await provider.uploadAssetFile(
        TEST_PROJECT_ID,
        TEST_ASSET_ID,
        'test.txt',
        testData,
        'text/plain'
      );
      expect(fileId).toBeDefined();

      // Download file
      const downloaded = await provider.downloadAssetFile(
        TEST_PROJECT_ID,
        TEST_ASSET_ID,
        'test.txt'
      );
      expect(downloaded.toString()).toBe('test content');

      // List files
      const files = await provider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      expect(files).toContain('test.txt');

      // Delete files
      await provider.deleteAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      const filesAfterDelete = await provider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
      expect(filesAfterDelete).not.toContain('test.txt');

      // Cleanup
      await provider.deleteProject(TEST_PROJECT_ID);
    });
  });

  describe('Provider Switching', () => {
    it('should allow switching between providers without data migration', async () => {
      // Start with local
      const localProvider = createStorageProvider({
        type: StorageProviderType.LOCAL,
        config: {
          basePath: './test-storage-switch',
        },
      });

      await localProvider.initialize();
      await localProvider.initializeProject(TEST_PROJECT_ID);

      // Upload file to local
      const testData = Buffer.from('local content');
      await localProvider.uploadAssetFile(
        TEST_PROJECT_ID,
        TEST_ASSET_ID,
        'test.txt',
        testData,
        'text/plain'
      );

      // Switch to GCS (if configured)
      const gcsConfig = {
        bucketName: process.env.TEST_GCS_BUCKET,
        projectId: process.env.TEST_GCS_PROJECT_ID,
      };

      if (gcsConfig.bucketName && gcsConfig.projectId) {
        const gcsProvider = createStorageProvider({
          type: StorageProviderType.GCS,
          config: gcsConfig,
        });

        await gcsProvider.initialize();
        await gcsProvider.initializeProject(TEST_PROJECT_ID);

        // Upload new file to GCS
        const gcsData = Buffer.from('gcs content');
        await gcsProvider.uploadAssetFile(
          TEST_PROJECT_ID,
          TEST_ASSET_ID,
          'test-gcs.txt',
          gcsData,
          'text/plain'
        );

        // Verify files are in different providers
        const localFiles = await localProvider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);
        const gcsFiles = await gcsProvider.listAssetFiles(TEST_PROJECT_ID, TEST_ASSET_ID);

        expect(localFiles).toContain('test.txt');
        expect(localFiles).not.toContain('test-gcs.txt');
        expect(gcsFiles).toContain('test-gcs.txt');
        expect(gcsFiles).not.toContain('test.txt');

        // Cleanup
        await gcsProvider.deleteProject(TEST_PROJECT_ID);
      }

      // Cleanup
      await localProvider.deleteProject(TEST_PROJECT_ID);
    });
  });
});
