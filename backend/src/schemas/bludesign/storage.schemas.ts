import Joi from 'joi';
import { StorageProviderType } from '@/bludesign/types/bludesign.types';

export const storageConfigUpdateSchema = Joi.object({
  providerType: Joi.string()
    .valid(StorageProviderType.LOCAL, StorageProviderType.GCS, StorageProviderType.GDRIVE)
    .required(),
  providerConfig: Joi.object().required(),
});

export const gdriveAuthUrlQuerySchema = Joi.object({
  clientId: Joi.string().required(),
  clientSecret: Joi.string().required(),
  redirectUri: Joi.string().optional(),
});

export const gdriveCallbackQuerySchema = Joi.object({
  code: Joi.string().required(),
  clientId: Joi.string().required(),
  clientSecret: Joi.string().required(),
  redirectUri: Joi.string().optional(),
});

export const gdriveRefreshTokensSchema = Joi.object({
  clientId: Joi.string().required(),
  clientSecret: Joi.string().required(),
  refreshToken: Joi.string().required(),
});

export const storageProviderTestParamSchema = Joi.object({
  provider: Joi.string().valid('local', 'gcs', 'gdrive').required(),
});

export const storageProviderTestBodySchema = Joi.object({
  storageConfig: Joi.object().required(),
});
