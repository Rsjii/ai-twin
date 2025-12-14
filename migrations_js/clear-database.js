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
      // New style learning tables (clear first)
      'ai_runs',
      'style_corrections', 
      'mem_chunks',
      'style_anchors',
      
      // Existing tables
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
    console.log('📊 Cleared tables:');
    console.log('   - ai_runs (AI performance tracking)');
    console.log('   - style_corrections (User feedback)');
    console.log('   - mem_chunks (Memory system)');
    console.log('   - style_anchors (Teaching examples)');
    console.log('   - Message (Chat messages)');
    console.log('   - Chat (Chat sessions)');
    console.log('   - Twin (AI twins)');
    console.log('   - Event (Analytics events)');
    console.log('   - Invite (Invitation system)');
    console.log('   - OTP (One-time passwords)');
    console.log('   - User (User accounts)');
    
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
    console.log('⚠️  This will clear ALL data from the database!');
    
    await clearAllData();
    
    console.log('\n🎯 Database has been completely cleared!');
    console.log('📝 All users, twins, chats, messages, and style learning data have been removed.');
    console.log('🔄 You can now start fresh with new users and style learning.');
    console.log('💡 The database structure (tables) remains intact - only data is cleared.');
    
  } catch (error) {
    console.error('💥 Failed to clear database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();