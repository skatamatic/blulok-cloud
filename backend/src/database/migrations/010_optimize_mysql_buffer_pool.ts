import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Set MySQL InnoDB Buffer Pool size to 512MB for better performance
  // This will keep frequently accessed data in memory for faster queries
  
  try {
    // Set buffer pool size to 512MB (adjust based on your data size)
    await knex.raw('SET GLOBAL innodb_buffer_pool_size = 536870912');
    
    console.log('✅ MySQL InnoDB Buffer Pool size set to 512MB');
  } catch (error: any) {
    console.log('⚠️  Could not set buffer pool size via SQL');
    console.log('📝 You may need to set innodb_buffer_pool_size in your MySQL configuration file');
    console.log('   Add this to your my.cnf/my.ini: innodb_buffer_pool_size = 512M');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert to MySQL default buffer pool size (128MB)
  try {
    await knex.raw('SET GLOBAL innodb_buffer_pool_size = 134217728');
    console.log('🔄 MySQL InnoDB Buffer Pool size reverted to default (128MB)');
  } catch (error: any) {
    console.log('⚠️  Could not revert buffer pool size via SQL');
    console.log('📝 You may need to manually set innodb_buffer_pool_size in your MySQL configuration file');
  }
}

