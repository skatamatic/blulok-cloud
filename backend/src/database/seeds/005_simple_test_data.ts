import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  console.log('🌱 Seeding simple test data...');

  // 1. Create Test Users
  console.log('👥 Creating test users...');
  const saltRounds = 12;
  const defaultPassword = await bcrypt.hash('TestPass123!', saltRounds);
  
  const testUsers = [
    {
      id: uuidv4(),
      email: 'admin@blulok.com',
      login_identifier: 'admin@blulok.com',
      password_hash: defaultPassword,
      first_name: 'System',
      last_name: 'Administrator',
      role: 'admin',
      is_active: true
    },
    {
      id: uuidv4(),
      email: 'facility.admin@downtown.com',
      login_identifier: 'facility.admin@downtown.com',
      password_hash: defaultPassword,
      first_name: 'Sarah',
      last_name: 'Johnson',
      role: 'facility_admin',
      is_active: true
    },
    {
      id: uuidv4(),
      email: 'tech@blulok.com',
      login_identifier: 'tech@blulok.com',
      password_hash: defaultPassword,
      first_name: 'Alex',
      last_name: 'Rodriguez',
      role: 'blulok_technician',
      is_active: true
    },
    {
      id: uuidv4(),
      email: 'john.smith@email.com',
      login_identifier: 'john.smith@email.com',
      password_hash: defaultPassword,
      first_name: 'John',
      last_name: 'Smith',
      role: 'tenant',
      is_active: true
    },
    {
      id: uuidv4(),
      email: 'lisa.anderson@email.com',
      login_identifier: 'lisa.anderson@email.com',
      password_hash: defaultPassword,
      first_name: 'Lisa',
      last_name: 'Anderson',
      role: 'tenant',
      is_active: true
    }
  ];

  // Check if users already exist to avoid duplicates
  for (const user of testUsers) {
    const existingUser = await knex('users').where('email', user.email).first();
    if (!existingUser) {
      await knex('users').insert(user);
      console.log(`✅ Created user: ${user.email}`);
    } else {
      console.log(`⏭️  User already exists: ${user.email}`);
    }
  }

  // 2. Create Simple Facilities
  console.log('📍 Creating facilities...');
  const simpleFacilities = [
    {
      id: uuidv4(),
      name: 'Downtown Storage Hub',
      description: 'Premium storage facility in downtown',
      address: '123 Main Street',
      city: 'Calgary',
      state: 'AB',
      zip_code: 'T2P 1A1',
      country: 'CA',
      latitude: 51.0447,
      longitude: -114.0719,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Warehouse District Storage',
      description: 'Large-scale storage facility',
      address: '456 Industrial Avenue',
      city: 'Calgary',
      state: 'AB', 
      zip_code: 'T3E 2B2',
      country: 'CA',
      latitude: 51.0234,
      longitude: -114.1234,
      is_active: true
    }
  ];

  for (const facility of simpleFacilities) {
    const existingFacility = await knex('facilities').where('name', facility.name).first();
    if (!existingFacility) {
      await knex('facilities').insert(facility);
      console.log(`✅ Created facility: ${facility.name}`);
    } else {
      console.log(`⏭️  Facility already exists: ${facility.name}`);
    }
  }

  // 3. Create User-Facility Associations
  console.log('🔗 Creating user-facility associations...');
  const facilityAdmin = testUsers.find(u => u.role === 'facility_admin');
  const firstFacility = simpleFacilities[0];
  
  if (facilityAdmin && firstFacility) {
    const existingAssociation = await knex('user_facility_associations')
      .where('user_id', facilityAdmin.id)
      .where('facility_id', firstFacility.id)
      .first();
      
    if (!existingAssociation) {
      await knex('user_facility_associations').insert({
        user_id: facilityAdmin.id,
        facility_id: firstFacility.id
      });
      console.log(`✅ Associated facility admin with ${firstFacility.name}`);
    }
  }

  // Summary
  console.log('\n🎉 Simple test data seeding complete!');
  console.log('🔑 Test Login Credentials:');
  console.log('   • admin@blulok.com / TestPass123!');
  console.log('   • facility.admin@downtown.com / TestPass123!');
  console.log('   • tech@blulok.com / TestPass123!');
  console.log('   • john.smith@email.com / TestPass123!');
  console.log('\n🚀 Ready for testing!');
}
