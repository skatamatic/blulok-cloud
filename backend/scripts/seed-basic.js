const { execSync } = require('child_process');
const path = require('path');

console.log('🌱 Running basic seeds...');

try {
  // Run seeds in order
  console.log('📋 Seeding device types...');
  execSync('knex seed:run --knexfile knexfile.ts --specific=001_device_types.ts', { stdio: 'inherit' });
  
  console.log('👥 Seeding default users...');
  execSync('knex seed:run --knexfile knexfile.ts --specific=002_default_users.ts', { stdio: 'inherit' });
  
  console.log('🎨 Seeding widget templates...');
  execSync('knex seed:run --knexfile knexfile.ts --specific=003_default_widget_templates.ts', { stdio: 'inherit' });
  
  console.log('✅ Basic seeds completed successfully!');
  console.log('📧 Admin users created:');
  console.log('   • admin@blulok.com (password: Admin123!@#)');
  console.log('   • devadmin@blulok.com (password: DevAdmin123!@#)');
} catch (error) {
  console.error('❌ Error running basic seeds:', error.message);
  process.exit(1);
}



