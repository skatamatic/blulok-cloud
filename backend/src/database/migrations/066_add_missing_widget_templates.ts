import { Knex } from 'knex';

const NEW_TEMPLATES = [
  {
    id: '550e8400-e29b-41d4-a716-446655440037',
    widget_id: 'facility-viewer',
    widget_type: 'facility-viewer',
    name: 'Facility 3D View',
    description:
      'Interactive 3D visualization of linked facility with real-time lock status',
    default_config: JSON.stringify({
      position: { x: 0, y: 0, w: 12, h: 4 },
      size: 'huge',
    }),
    available_sizes: JSON.stringify([
      'huge',
      'huge-wide',
      'dock-left',
      'dock-right',
      'dock-bottom-two-thirds',
      'dock-full',
    ]),
    required_permissions: JSON.stringify(['admin', 'facility_admin', 'maintenance']),
    is_active: true,
    default_order: 14,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440038',
    widget_id: 'remote-gate',
    widget_type: 'remote-gate',
    name: 'Remote Gate Control',
    description: 'Control facility gates remotely',
    default_config: JSON.stringify({
      position: { x: 0, y: 2, w: 6, h: 2 },
      size: 'medium',
    }),
    available_sizes: JSON.stringify(['medium', 'large']),
    required_permissions: JSON.stringify(['admin', 'facility_admin', 'maintenance']),
    is_active: true,
    default_order: 15,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440039',
    widget_id: 'daily-access-codes',
    widget_type: 'daily-access-codes',
    name: 'Daily Access Codes',
    description: 'View and refresh active keypad access codes',
    default_config: JSON.stringify({
      position: { x: 6, y: 2, w: 6, h: 2 },
      size: 'medium',
    }),
    available_sizes: JSON.stringify([
      'small',
      'medium',
      'medium-tall',
      'large',
    ]),
    required_permissions: JSON.stringify([
      'tenant',
      'admin',
      'dev_admin',
      'facility_admin',
      'maintenance',
    ]),
    is_active: true,
    default_order: 16,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440040',
    widget_id: 'histogram',
    widget_type: 'histogram',
    name: 'Activity Histogram',
    description: 'Site activity over time',
    default_config: JSON.stringify({
      position: { x: 0, y: 4, w: 12, h: 2 },
      size: 'large-wide',
    }),
    available_sizes: JSON.stringify([
      'medium',
      'medium-tall',
      'large',
      'large-wide',
      'huge',
      'huge-wide',
      'dock-top',
      'dock-bottom',
      'dock-bottom-two-thirds',
    ]),
    required_permissions: JSON.stringify(['admin', 'facility_admin', 'maintenance']),
    is_active: true,
    default_order: 17,
  },
];

export async function up(knex: Knex): Promise<void> {
  const existingIds = await knex('default_widget_templates')
    .whereIn(
      'widget_id',
      NEW_TEMPLATES.map((t) => t.widget_id)
    )
    .pluck('widget_id');

  const toInsert = NEW_TEMPLATES.filter((t) => !existingIds.includes(t.widget_id)).map(
    (t) => ({
      ...t,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    })
  );

  if (toInsert.length > 0) {
    await knex('default_widget_templates').insert(toInsert);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('default_widget_templates')
    .whereIn(
      'widget_id',
      NEW_TEMPLATES.map((t) => t.widget_id)
    )
    .del();
}
