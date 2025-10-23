const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'blulok_dev'
  }
});

knex('fms_changes').columnInfo().then(info => {
  console.log('fms_changes table columns:');
  Object.keys(info).forEach(col => {
    console.log(`  ${col}: ${info[col].type} ${info[col].nullable ? '(nullable)' : '(not null)'}`);
  });
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
