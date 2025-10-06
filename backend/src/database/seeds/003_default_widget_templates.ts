import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex('default_widget_templates').del();

  // Insert default widget templates
  await knex('default_widget_templates').insert([
    {
      id: '550e8400-e29b-41d4-a716-446655440020',
      widget_id: 'facilities_stats',
      widget_type: 'stats',
      name: 'Total Facilities',
      description: 'Shows total number of facilities with trend data',
      default_config: JSON.stringify({
        position: { x: 0, y: 0, w: 3, h: 2 },
        size: 'medium',
        color: 'blue',
        icon: 'BuildingStorefrontIcon'
      }),
      available_sizes: JSON.stringify(['tiny', 'small', 'medium']),
      required_permissions: JSON.stringify([]),
      is_active: true,
      default_order: 1,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440021',
      widget_id: 'devices_stats',
      widget_type: 'stats',
      name: 'Active Devices',
      description: 'Shows number of active devices with status trends',
      default_config: JSON.stringify({
        position: { x: 3, y: 0, w: 3, h: 2 },
        size: 'medium',
        color: 'green',
        icon: 'CubeIcon'
      }),
      available_sizes: JSON.stringify(['tiny', 'small', 'medium']),
      required_permissions: JSON.stringify([]),
      is_active: true,
      default_order: 2,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440022',
      widget_id: 'users_stats',
      widget_type: 'stats',
      name: 'Registered Users',
      description: 'Shows total registered users with growth trends',
      default_config: JSON.stringify({
        position: { x: 6, y: 0, w: 3, h: 2 },
        size: 'medium',
        color: 'purple',
        icon: 'UsersIcon'
      }),
      available_sizes: JSON.stringify(['tiny', 'small', 'medium']),
      required_permissions: JSON.stringify(['admin', 'dev_admin', 'facility_admin']),
      is_active: true,
      default_order: 3,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440023',
      widget_id: 'alerts_stats',
      widget_type: 'stats',
      name: 'Active Alerts',
      description: 'Shows current system alerts and warnings',
      default_config: JSON.stringify({
        position: { x: 9, y: 0, w: 3, h: 2 },
        size: 'medium',
        color: 'red',
        icon: 'ExclamationTriangleIcon'
      }),
      available_sizes: JSON.stringify(['tiny', 'small', 'medium']),
      required_permissions: JSON.stringify([]),
      is_active: true,
      default_order: 4,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440024',
      widget_id: 'recent_activity',
      widget_type: 'activity',
      name: 'Recent Activity',
      description: 'Shows recent system activity and events',
      default_config: JSON.stringify({
        position: { x: 0, y: 2, w: 6, h: 4 },
        size: 'medium'
      }),
      available_sizes: JSON.stringify(['medium', 'large', 'huge']),
      required_permissions: JSON.stringify([]),
      is_active: true,
      default_order: 5,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440025',
      widget_id: 'system_status',
      widget_type: 'status',
      name: 'System Status',
      description: 'Shows current system and service status',
      default_config: JSON.stringify({
        position: { x: 6, y: 2, w: 6, h: 4 },
        size: 'medium'
      }),
      available_sizes: JSON.stringify(['small', 'medium', 'large']),
      required_permissions: JSON.stringify([]),
      is_active: true,
      default_order: 6,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440026',
      widget_id: 'performance_stats',
      widget_type: 'stats',
      name: 'System Performance',
      description: 'Shows overall system performance metrics',
      default_config: JSON.stringify({
        position: { x: 0, y: 6, w: 12, h: 3 },
        size: 'large',
        color: 'green',
        icon: 'ChartBarIcon'
      }),
      available_sizes: JSON.stringify(['medium', 'large', 'huge']),
      required_permissions: JSON.stringify(['admin', 'dev_admin']),
      is_active: true,
      default_order: 7,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440027',
      widget_id: 'syncfms',
      widget_type: 'syncfms',
      name: 'FMS Sync',
      description: 'Synchronize customer data with FMS',
      default_config: JSON.stringify({
        position: { x: 0, y: 9, w: 6, h: 3 },
        size: 'medium',
        color: 'blue',
        icon: 'ArrowPathIcon'
      }),
      available_sizes: JSON.stringify(['small', 'medium', 'large']),
      required_permissions: JSON.stringify(['admin', 'dev_admin', 'facility_admin']),
      is_active: true,
      default_order: 8,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);
}
