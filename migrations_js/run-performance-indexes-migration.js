const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  let client;
  
  try {
    console.log('🚀 Starting Performance Indexes Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '018_add_performance_indexes.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Performance Indexes Migration completed successfully!');
    console.log('📊 Indexes created:');
    console.log('   - Discover page indexes (isPublic + engagement)');
    console.log('   - Memory retrieval indexes (twinId + key + updatedAt)');
    console.log('   - Message query indexes (chatId + sender + createdAt)');
    console.log('   - Chat query indexes (userId + twinId + createdAt)');
    console.log('   - Session memory indexes (chatId + lastUpdated)');
    console.log('   - Style anchors indexes (twin_id + type + created_at)');
    
    // Verify indexes were created
    const indexCheck = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE indexname LIKE 'idx_%' 
      AND indexname IN (
        'idx_twin_ispublic_engagement',
        'idx_memory_longterm_twinid_key_updatedat',
        'idx_message_chatid_sender_createdat',
        'idx_chat_userid_twinid_createdat',
        'idx_memory_session_chatid_lastupdated'
      )
      ORDER BY tablename, indexname
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('🔍 Verification - Indexes created:');
      indexCheck.rows.forEach(row => {
        console.log(`   ✅ ${row.indexname} on ${row.tablename}`);
      });
    } else {
      console.warn('⚠️  Warning: Some indexes not found after migration');
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Test query performance improvements');
    console.log('   3. Monitor query execution times');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.hint) {
      console.error('Hint:', error.hint);
    }
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });

