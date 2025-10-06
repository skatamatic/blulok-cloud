#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('🔄 Resetting database for demo...');
console.log('');

try {
  // Initialize database
  console.log('1️⃣ Initializing database...');
  execSync('npm run db:init', { stdio: 'inherit' });
  
  // Run migrations
  console.log('2️⃣ Running migrations...');
  execSync('npm run migrate', { stdio: 'inherit' });
  
  // Seed with test data
  console.log('3️⃣ Seeding test data...');
  execSync('npm run seed:simple', { stdio: 'inherit' });
  
  console.log('');
  console.log('🎉 Demo database ready!');
  console.log('');
  console.log('🔑 Test Login Credentials:');
  console.log('   • admin@blulok.com / TestPass123!');
  console.log('   • facility.admin@downtown.com / TestPass123!');
  console.log('   • tech@blulok.com / TestPass123!');
  console.log('   • john.smith@email.com / TestPass123!');
  console.log('');
  console.log('🚀 Ready for demo!');

} catch (error) {
  console.error('❌ Error setting up demo database:', error.message);
  process.exit(1);
}

