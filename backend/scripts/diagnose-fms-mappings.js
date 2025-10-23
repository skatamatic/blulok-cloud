/**
 * Diagnostic script to check FMS entity mappings and identify issues
 * 
 * Run with: node scripts/diagnose-fms-mappings.js
 */

const knex = require('knex');
const path = require('path');
const knexConfig = require(path.join(__dirname, '..', 'knexfile.ts'));

const db = knex(knexConfig.development || knexConfig.default.development);

async function diagnose() {
  console.log('🔍 FMS Entity Mapping Diagnostic\n');

  try {
    // Get all facilities with FMS config
    const facilities = await db('facilities')
      .select('id', 'name')
      .whereExists(function() {
        this.select('*')
          .from('fms_configurations')
          .whereRaw('fms_configurations.facility_id = facilities.id');
      });

    console.log(`📌 Found ${facilities.length} facilities with FMS configured\n`);

    for (const facility of facilities) {
      console.log(`\n========== ${facility.name} (${facility.id}) ==========\n`);

      // Get all user mappings for this facility
      const userMappings = await db('fms_entity_mappings')
        .where({ facility_id: facility.id, entity_type: 'user' });

      console.log(`👥 User Mappings: ${userMappings.length}`);

      // Get all users for this facility
      const facilityUsers = await db('user_facility_associations as ufa')
        .join('users', 'users.id', 'ufa.user_id')
        .where('ufa.facility_id', facility.id)
        .where('users.role', 'tenant')
        .select('users.id', 'users.email', 'users.first_name', 'users.last_name');

      console.log(`👥 Total Tenant Users: ${facilityUsers.length}`);

      // Find users without mappings
      const usersWithoutMappings = facilityUsers.filter(user => 
        !userMappings.some(m => m.internal_id === user.id)
      );

      if (usersWithoutMappings.length > 0) {
        console.log(`\n⚠️  Users WITHOUT FMS Mappings (${usersWithoutMappings.length}):`);
        usersWithoutMappings.forEach(user => {
          console.log(`   - ${user.email} (${user.first_name} ${user.last_name}) [${user.id}]`);
        });
      } else {
        console.log(`✅ All users have FMS mappings`);
      }

      // Get all unit mappings for this facility
      const unitMappings = await db('fms_entity_mappings')
        .where({ facility_id: facility.id, entity_type: 'unit' });

      console.log(`\n🏢 Unit Mappings: ${unitMappings.length}`);

      // Get all units for this facility
      const facilityUnits = await db('units')
        .where('facility_id', facility.id);

      console.log(`🏢 Total Units: ${facilityUnits.length}`);

      // Find units without mappings
      const unitsWithoutMappings = facilityUnits.filter(unit => 
        !unitMappings.some(m => m.internal_id === unit.id)
      );

      if (unitsWithoutMappings.length > 0) {
        console.log(`\n⚠️  Units WITHOUT FMS Mappings (${unitsWithoutMappings.length}):`);
        unitsWithoutMappings.forEach(unit => {
          console.log(`   - ${unit.unit_number} [${unit.id}]`);
        });
      } else {
        console.log(`✅ All units have FMS mappings`);
      }

      // Check for duplicate internal_id mappings
      const duplicateInternalIds = await db('fms_entity_mappings')
        .where({ facility_id: facility.id })
        .select('entity_type', 'internal_id')
        .count('* as count')
        .groupBy('entity_type', 'internal_id')
        .having('count', '>', 1);

      if (duplicateInternalIds.length > 0) {
        console.log(`\n❌ DUPLICATE internal_id Mappings (${duplicateInternalIds.length}):`);
        duplicateInternalIds.forEach(dup => {
          console.log(`   - ${dup.entity_type}: internal_id mapped ${dup.count} times`);
        });
      }

      // Check for duplicate external_id mappings
      const duplicateExternalIds = await db('fms_entity_mappings')
        .where({ facility_id: facility.id })
        .select('entity_type', 'external_id')
        .count('* as count')
        .groupBy('entity_type', 'external_id')
        .having('count', '>', 1);

      if (duplicateExternalIds.length > 0) {
        console.log(`\n❌ DUPLICATE external_id Mappings (${duplicateExternalIds.length}):`);
        duplicateExternalIds.forEach(dup => {
          console.log(`   - ${dup.entity_type}: external_id '${dup.external_id}' mapped ${dup.count} times`);
        });
      }
    }

    console.log('\n\n✨ Diagnostic Complete\n');
  } catch (error) {
    console.error('Error running diagnostic:', error);
  } finally {
    await db.destroy();
  }
}

diagnose();

