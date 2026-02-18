/**
 * Shared Base Storage Module
 */

export * from './base-storage.interface';
export * from './base-storage.factory';
export { LocalBaseStorage } from './local-base.provider';
export { GCSBaseStorage } from './gcs-base.provider';
export { GDriveBaseStorage } from './gdrive-base.provider';
