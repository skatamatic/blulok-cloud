import Joi from 'joi';
import { StorageProviderType } from '@/services/storage';

export const firmwareStorageConfigBodySchema = Joi.object({
  providerType: Joi.string()
    .valid(StorageProviderType.LOCAL, StorageProviderType.GCS, StorageProviderType.GDRIVE)
    .required(),
  providerConfig: Joi.object().required(),
});
