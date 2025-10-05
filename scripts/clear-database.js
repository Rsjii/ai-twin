// Script to clear all data from database tables
const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ai_twin',
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

async function resetSequences() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Resetting sequences...');
    
    // Reset any auto-increment sequences if they exist
    const sequences = [
      'User_id_seq',
      'Twin_id_seq', 
      'Chat_id_seq',
      'Message_id_seq',
      'OTP_id_seq',
      'Invite_id_seq',
      'Event_id_seq'
    ];
    
    for (const seq of sequences) {
      try {
        await client.query(`SELECT setval('"${seq}"', 1, false);`);
        console.log(`✅ Reset sequence ${seq}`);
      } catch (error) {
        // Sequence might not exist, that's okay
        console.log(`⚠️  Sequence ${seq} not found (this is normal)`);
      }
    }
    
    console.log('✅ Sequence reset completed!');
    
  } catch (error) {
    console.error('❌ Error resetting sequences:', error);
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log('🚀 Starting database reset...');
    
    await clearAllData();
    await resetSequences();
    
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
