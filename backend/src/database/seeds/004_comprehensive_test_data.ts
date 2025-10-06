import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

/**
 * Comprehensive Test Data Seed
 * 
 * Creates a full set of test data including:
 * - 5 facilities (including Downtown Storage Hub for FMS testing)
 * - Gateways, units, and devices for each facility
 * - Facility admins, maintenance users, and tenant users
 * - Unit assignments and access history
 * 
 * This seed is designed to work with the FMS simulated provider data.
 */

export async function seed(knex: Knex): Promise<void> {
  // Clear existing data (in reverse dependency order)
  await knex('access_logs').del();
  await knex('unit_assignments').del();
  await knex('units').del();
  await knex('blulok_devices').del();
  await knex('access_control_devices').del();
  await knex('gateways').del();
  await knex('user_facility_associations').del();
  await knex('facilities').del();
  // Keep existing users from 002_default_users.ts and device_types from 001_device_types.ts

  console.log('🌱 Seeding comprehensive test data...');

  // 1. Create Facilities
  console.log('📍 Creating facilities...');
  const facilities = [
    {
      id: uuidv4(),
      name: 'Downtown Storage Hub',
      description: 'Premium storage facility in the heart of downtown with 24/7 security and climate control.',
      address: '123 Main Street, Downtown District, City Center, AB T2P 1A1',
      latitude: 51.0447,
      longitude: -114.0719,
      contact_email: 'manager@downtownstorage.com',
      contact_phone: '(403) 555-0101',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Warehouse District Storage',
      description: 'Large-scale storage facility perfect for commercial and residential needs.',
      address: '456 Industrial Avenue, Warehouse District, Business Park, AB T3E 2B2',
      latitude: 51.0234,
      longitude: -114.1234,
      contact_email: 'admin@warehousestorage.com',
      contact_phone: '(403) 555-0202',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Airport Storage Solutions',
      description: 'Convenient storage near the airport with easy highway access.',
      address: '789 Airport Road, Airport District, Terminal Area, AB T1Y 3C3',
      latitude: 51.1234,
      longitude: -114.0567,
      contact_email: 'info@airportstorage.com',
      contact_phone: '(403) 555-0303',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Riverside Storage Center',
      description: 'Modern storage facility with river views and premium amenities.',
      address: '321 River Road, Riverside District, Waterfront, AB T4R 4R4',
      latitude: 51.0567,
      longitude: -114.0890,
      contact_email: 'contact@riversidestorage.com',
      contact_phone: '(403) 555-0404',
      status: 'active'
    },
    {
      id: uuidv4(),
      name: 'Mountain View Storage',
      description: 'Scenic storage facility with mountain views and outdoor access.',
      address: '654 Mountain Drive, Hillside District, Scenic View, AB T5M 5M5',
      latitude: 51.0789,
      longitude: -114.1123,
      contact_email: 'hello@mountainviewstorage.com',
      contact_phone: '(403) 555-0505',
      status: 'active'
    }
  ];

  await knex('facilities').insert(facilities);
  console.log(`✅ Created ${facilities.length} facilities`);

  // 2. Create Gateways (1 per facility)
  console.log('🌐 Creating gateways...');
  const gateways = facilities.map(facility => ({
    id: uuidv4(),
    facility_id: facility.id,
    name: `${facility.name} Gateway`,
    model: 'BluLok Gateway Pro',
    firmware_version: '2.1.4',
    ip_address: `192.168.${Math.floor(Math.random() * 255) + 1}.1`,
    mac_address: `00:1B:44:${Math.floor(Math.random() * 255).toString(16).padStart(2, '0')}:${Math.floor(Math.random() * 255).toString(16).padStart(2, '0')}:${Math.floor(Math.random() * 255).toString(16).padStart(2, '0')}`,
    status: Math.random() > 0.1 ? 'online' : 'offline',
    last_seen: new Date(Date.now() - Math.random() * 60 * 60 * 1000) // Within last hour
  }));

  await knex('gateways').insert(gateways);
  console.log(`✅ Created ${gateways.length} gateways`);

  // 3. Create Units and BluLok Devices
  console.log('🔐 Creating units and BluLok devices...');
  const units: any[] = [];
  const blulokDevices: any[] = [];

  facilities.forEach((facility, facilityIndex) => {
    const gateway = gateways[facilityIndex];
    if (!gateway) return;

    // Create 20-30 units per facility
    const unitCount = 20 + Math.floor(Math.random() * 11);

    for (let i = 0; i < unitCount; i++) {
      const unitId = uuidv4();
      const blulokId = uuidv4();

      // Generate unit number with facility prefix (e.g., DOW-A-101)
      const facilityPrefix = facility.name.substring(0, 3).toUpperCase();
      const section = String.fromCharCode(65 + Math.floor(i / 10)); // A, B, C, etc.
      const unitNumber = `${facilityPrefix}-${section}-${String((i % 10) + 101).padStart(3, '0')}`;

      // Unit size and pricing
      const sizes = ['small', 'medium', 'large', 'xl'] as const;
      const unitSize: typeof sizes[number] = sizes[Math.floor(Math.random() * sizes.length)] || 'medium';
      const rateMap: Record<typeof sizes[number], number> = { small: 89.99, medium: 129.99, large: 179.99, xl: 229.99 };

      units.push({
        id: unitId,
        facility_id: facility.id,
        unit_number: unitNumber,
        unit_type: unitSize.charAt(0).toUpperCase() + unitSize.slice(1),
        size_sqft: unitSize === 'small' ? 25 : unitSize === 'medium' ? 50 : unitSize === 'large' ? 100 : 200,
        monthly_rate: rateMap[unitSize],
        status: 'available' // All units start as available, will be updated to occupied when assigned
      });

      // Create corresponding BluLok device
      const lockStatus = Math.random() > 0.95 ? 'unlocked' : 'locked'; // 5% unlocked
      const batteryLevel = Math.floor(Math.random() * 100) + 1;

      blulokDevices.push({
        id: blulokId,
        gateway_id: gateway.id,
        unit_id: unitId,
        device_serial: `BL-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        firmware_version: '1.2.3',
        lock_status: lockStatus,
        device_status: batteryLevel < 20 ? 'low_battery' : 'online',
        battery_level: batteryLevel,
        last_activity: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Within last 24 hours
        last_seen: new Date(Date.now() - Math.random() * 60 * 60 * 1000) // Within last hour
      });
    }
  });

  await knex('units').insert(units);
  await knex('blulok_devices').insert(blulokDevices);
  console.log(`✅ Created ${units.length} units and ${blulokDevices.length} BluLok devices`);

  // 4. Create Access Control Devices
  console.log('🚪 Creating access control devices...');
  const accessControlDevices: any[] = [];

  gateways.forEach((gateway) => {
    // Create 1-3 access control devices per facility
    const deviceCount = 1 + Math.floor(Math.random() * 3);
    const deviceTypes = ['gate', 'elevator', 'door'] as const;

    for (let i = 0; i < deviceCount; i++) {
      const deviceType: typeof deviceTypes[number] = deviceTypes[i % deviceTypes.length] || 'door';
      const locations: Record<typeof deviceTypes[number], string[]> = {
        gate: ['Main Entrance', 'Loading Dock', 'Emergency Exit'],
        elevator: ['Floor 1', 'Floor 2', 'Basement'],
        door: ['Section A', 'Section B', 'Section C', 'Maintenance Room']
      };

      const location = locations[deviceType][Math.floor(Math.random() * locations[deviceType].length)];

      accessControlDevices.push({
        id: uuidv4(),
        gateway_id: gateway.id,
        name: `${gateway.name.replace(' Gateway', '')} ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} ${i + 1}`,
        device_type: deviceType,
        location_description: location,
        relay_channel: i + 1,
        status: Math.random() > 0.1 ? 'online' : 'offline',
        last_activity: new Date(Date.now() - Math.random() * 10 * 60 * 1000) // Within 10 minutes
      });
    }
  });

  await knex('access_control_devices').insert(accessControlDevices);
  console.log(`✅ Created ${accessControlDevices.length} access control devices`);

  // 5. Create Users
  console.log('👥 Creating users...');
  const users: any[] = [];
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Create facility admins (2 per facility)
  facilities.forEach((facility, facilityIndex) => {
    for (let i = 0; i < 2; i++) {
      users.push({
        id: uuidv4(),
        email: `admin${facilityIndex + 1}${i + 1}@${facility.name.toLowerCase().replace(/\s+/g, '')}.com`,
        password_hash: passwordHash,
        first_name: `Facility${facilityIndex + 1}`,
        last_name: `Admin${i + 1}`,
        role: 'facility_admin',
        is_active: true
      });
    }
  });

  // Create maintenance users (2 per facility)
  facilities.forEach((facility, facilityIndex) => {
    for (let i = 0; i < 2; i++) {
      users.push({
        id: uuidv4(),
        email: `maintenance${facilityIndex + 1}${i + 1}@${facility.name.toLowerCase().replace(/\s+/g, '')}.com`,
        password_hash: passwordHash,
        first_name: `Maintenance${facilityIndex + 1}`,
        last_name: `Tech${i + 1}`,
        role: 'maintenance',
        is_active: true
      });
    }
  });

  // Create tenant users (5-10 per facility)
  facilities.forEach((facility, facilityIndex) => {
    const tenantCount = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < tenantCount; i++) {
      users.push({
        id: uuidv4(),
        email: `tenant${facilityIndex + 1}${i + 1}@${facility.name.toLowerCase().replace(/\s+/g, '')}.com`,
        password_hash: passwordHash,
        first_name: `Tenant${facilityIndex + 1}`,
        last_name: `User${i + 1}`,
        role: 'tenant',
        is_active: true
      });
    }
  });

  await knex('users').insert(users);
  console.log(`✅ Created ${users.length} users`);

  // 6. Create User-Facility Associations
  console.log('🔗 Creating user-facility associations...');
  const associations: any[] = [];

  // Associate facility admins and maintenance with their facilities
  let userIndex = 0;
  facilities.forEach((facility) => {
    // 2 facility admins per facility
    for (let i = 0; i < 2; i++) {
      associations.push({
        id: uuidv4(),
        user_id: users[userIndex].id,
        facility_id: facility.id,
        created_at: new Date()
      });
      userIndex++;
    }

    // 2 maintenance users per facility
    for (let i = 0; i < 2; i++) {
      associations.push({
        id: uuidv4(),
        user_id: users[userIndex].id,
        facility_id: facility.id,
        created_at: new Date()
      });
      userIndex++;
    }
  });

  // Associate some tenants with multiple facilities
  const tenantUsers = users.filter(user => user.role === 'tenant');
  tenantUsers.forEach((tenant) => {
    // Each tenant gets 1-3 facility associations
    const facilityCount = 1 + Math.floor(Math.random() * 3);
    const selectedFacilities = facilities.sort(() => 0.5 - Math.random()).slice(0, facilityCount);

    selectedFacilities.forEach(facility => {
      associations.push({
        id: uuidv4(),
        user_id: tenant.id,
        facility_id: facility.id,
        created_at: new Date()
      });
    });
  });

  await knex('user_facility_associations').insert(associations);
  console.log(`✅ Created ${associations.length} user-facility associations`);

  // 7. Create Unit Assignments
  console.log('🏠 Creating unit assignments...');
  const assignments: any[] = [];
  const unitIdsToUpdate: string[] = [];

  // Assign units to tenants
  tenantUsers.forEach(tenant => {
    // Each tenant gets 1-3 units
    const unitCount = 1 + Math.floor(Math.random() * 3);
    const availableUnits = units.filter(unit => unit.status === 'available');
    const selectedUnits = availableUnits.sort(() => 0.5 - Math.random()).slice(0, unitCount);

    selectedUnits.forEach(unit => {
      assignments.push({
        id: uuidv4(),
        tenant_id: tenant.id,
        unit_id: unit.id,
        is_primary: true, // Set as primary tenant
        access_type: 'full',
        access_granted_at: new Date(),
        created_at: new Date()
      });

      // Mark this unit as occupied
      unitIdsToUpdate.push(unit.id);
    });
  });

  await knex('unit_assignments').insert(assignments);
  console.log(`✅ Created ${assignments.length} unit assignments`);

  // Update unit status to occupied for assigned units
  if (unitIdsToUpdate.length > 0) {
    await knex('units')
      .whereIn('id', unitIdsToUpdate)
      .update({ status: 'occupied' });
    console.log(`✅ Updated ${unitIdsToUpdate.length} units to occupied status`);
  }

  // 8. Create Access History
  console.log('📜 Creating access history...');
  const accessLogs: any[] = [];
  const actions = ['unlock', 'lock', 'access_granted', 'access_denied', 'manual_override'];
  const methods = ['app', 'keypad', 'card', 'manual', 'automatic'];

  // Create 200-500 access history records
  const recordCount = 200 + Math.floor(Math.random() * 301);

  for (let i = 0; i < recordCount; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];

    // 70% chance for blulok device, 30% for access control
    const useBlulokDevice = Math.random() < 0.7;
    let device: any, deviceType: string = '', unit: any, facility: any;

    if (useBlulokDevice && blulokDevices.length > 0) {
      device = blulokDevices[Math.floor(Math.random() * blulokDevices.length)];
      deviceType = 'blulok';
      unit = units.find((u: any) => u.id === device.unit_id);
      facility = facilities.find((f: any) => f.id === unit?.facility_id);
    } else if (accessControlDevices.length > 0) {
      device = accessControlDevices[Math.floor(Math.random() * accessControlDevices.length)];
      deviceType = 'access_control';
      const gateway = gateways.find((g: any) => g.id === device.gateway_id);
      facility = facilities.find((f: any) => f.id === gateway?.facility_id);
      unit = null; // Access control devices don't have specific units
    }

    if (!device || !facility || !deviceType) continue;

    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const minutesAgo = Math.floor(Math.random() * 60);
    const occurredAt = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000) - (hoursAgo * 60 * 60 * 1000) - (minutesAgo * 60 * 1000));

    accessLogs.push({
      id: uuidv4(),
      device_id: device.id,
      device_type: deviceType,
      user_id: user.id,
      action: action,
      method: method,
      success: action !== 'access_denied',
      reason: action === 'access_denied' ? 'Access denied by system' : null,
      ip_address: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
      metadata: {
        user: {
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          navigation_url: `/users?highlight=${user.id}`
        },
        facility: {
          id: facility.id,
          name: facility.name,
          navigation_url: `/facilities?highlight=${facility.id}`
        },
        unit: unit ? {
          id: unit.id,
          number: unit.unit_number,
          type: unit.unit_type,
          navigation_url: `/facilities?highlight=${facility.id}&unit=${unit.id}`
        } : null,
        device: {
          id: device.id,
          name: device.name || `${facility?.name} Unit ${unit?.unit_number} Lock`,
          type: deviceType,
          location: device.location_description || unit?.unit_number || 'Unknown',
          navigation_url: deviceType === 'blulok'
            ? `/facilities?highlight=${facility.id}&unit=${unit?.id}&device=${device.id}`
            : `/devices?highlight=${device.id}`
        },
        description: `${action} ${deviceType === 'blulok' ? 'unit' : 'access point'} ${device.name || `${facility?.name} Unit ${unit?.unit_number} Lock`}`,
        temperature: Math.floor(Math.random() * 20) + 15,
        humidity: Math.floor(Math.random() * 40) + 30,
        battery_level: Math.floor(Math.random() * 100) + 1
      },
      occurred_at: occurredAt
    });
  }

  await knex('access_logs').insert(accessLogs);
  console.log(`✅ Created ${accessLogs.length} access history records`);

  console.log('✅ Comprehensive test data seeding completed!');
  console.log(`
📊 Summary:
   • ${facilities.length} facilities
   • ${gateways.length} gateways
   • ${units.length} units
   • ${blulokDevices.length} BluLok devices
   • ${accessControlDevices.length} access control devices
   • ${users.length} users
   • ${associations.length} user-facility associations
   • ${assignments.length} unit assignments
   • ${accessLogs.length} access history records
  `);
}