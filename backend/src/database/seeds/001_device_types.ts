import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex('device_types').del();

  // Inserts seed entries
  await knex('device_types').insert([
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'BluLok Storage Container',
      description: 'Primary locking mechanism for individual storage containers',
      capabilities: JSON.stringify([
        'lock',
        'unlock', 
        'status_monitoring',
        'access_logging',
        'remote_control',
        'battery_monitoring'
      ]),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'BluLok Gate Controller',
      description: 'Access control for facility gates and main entrances',
      capabilities: JSON.stringify([
        'gate_control',
        'access_validation',
        'status_monitoring',
        'access_logging',
        'remote_control',
        'camera_integration'
      ]),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      name: 'BluLok Elevator Controller',
      description: 'Access control for elevator systems in multi-story facilities',
      capabilities: JSON.stringify([
        'elevator_control',
        'floor_access_control',
        'status_monitoring',
        'access_logging',
        'remote_control',
        'emergency_override'
      ]),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);
}
