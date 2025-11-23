// Script to clear all data from database tables
const { Pool } = require('pg');

// Database connection configuration - using Supabase
const pool = new Pool({
  connectionString: 'postgresql://postgres.ovqfpobyqbbquvfxhibi:WzKZY+gg.H74hqZ@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function clearAllData() {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Starting database cleanup...');
    
    // Disable foreign key checks temporarily
    await client.query('SET session_replication_role = replica;');
    
    // Clear all tables in correct order (respecting foreign keys)
    const tables = [
      'Message',
      'Chat', 
      'Twin',
      'Event',
      'Invite',
      'OTP',
      'User'
    ];
    
    for (const table of tables) {
      try {
        const result = await client.query(`DELETE FROM "${table}"`);
        console.log(`✅ Cleared ${table} table: ${result.rowCount} rows deleted`);
      } catch (error) {
        console.log(`⚠️  Table ${table} might not exist or is empty: ${error.message}`);
      }
    }
    
    // Re-enable foreign key checks
    await client.query('SET session_replication_role = DEFAULT;');
    
    console.log('🎉 Database cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('🚀 Starting database reset...');
    
    await clearAllData();
    
    console.log('\n🎯 Database has been completely cleared!');
    console.log('📝 All users, twins, chats, messages, and other data have been removed.');
    console.log('🔄 You can now start fresh with new users.');
    
  } catch (error) {
    console.error('💥 Failed to clear database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();
