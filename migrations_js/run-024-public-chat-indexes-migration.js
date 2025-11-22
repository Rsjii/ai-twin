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
    console.log('🚀 Starting Public Chat Indexes Migration (024)...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'backend', 'migrations', '024_add_public_chat_indexes.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Public Chat Indexes Migration completed successfully!');
    console.log('📊 Indexes created:');
    console.log('   - idx_publicchat_twinid_userid_createdat (user-wise filtering)');
    console.log('   - idx_publicchat_twinid_createdat (date range filtering)');
    console.log('   - idx_publicchat_twinid_lastactivity (lastActivity sorting)');
    console.log('   - idx_publicchat_twinid_messagecount (message count sorting)');
    console.log('   - idx_publicmessage_content_gin (message content search)');
    console.log('   - idx_publicmessage_chatid_createdat_desc (chat + message search)');
    
    // Verify indexes were created
    const indexCheck = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE indexname LIKE 'idx_public%' 
      AND indexname IN (
        'idx_publicchat_twinid_userid_createdat',
        'idx_publicchat_twinid_createdat',
        'idx_publicchat_twinid_lastactivity',
        'idx_publicchat_twinid_messagecount',
        'idx_publicmessage_content_gin',
        'idx_publicmessage_chatid_createdat_desc'
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
    console.log('   2. Test public chat filtering performance');
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