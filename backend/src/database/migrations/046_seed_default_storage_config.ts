import { Knex } from 'knex';

const DEFAULT_GCS_PROJECT_ID = 'BluLok-Cloud-Dev';
const DEFAULT_GCS_BUCKET = 'blulok-develop';

/**
 * Seed default firmware storage configuration in system_settings.
 * Defaults to Google Cloud Storage using Application Default Credentials.
 */
export async function up(knex: Knex): Promise<void> {
  const existing = await knex('system_settings')
    .where({ key: 'storage.firmware.provider_type' })
    .first();

  if (!existing) {
    await knex('system_settings').insert({
      id: knex.raw('(UUID())'),
      key: 'storage.firmware.provider_type',
      value: 'gcs',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }

  const existingConfig = await knex('system_settings')
    .where({ key: 'storage.firmware.provider_config' })
    .first();

  if (!existingConfig) {
    await knex('system_settings').insert({
      id: knex.raw('(UUID())'),
      key: 'storage.firmware.provider_config',
      value: JSON.stringify({
        projectId: DEFAULT_GCS_PROJECT_ID,
        bucketName: DEFAULT_GCS_BUCKET,
      }),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('system_settings')
    .where({ key: 'storage.firmware.provider_type' })
    .orWhere({ key: 'storage.firmware.provider_config' })
    .delete();
}
