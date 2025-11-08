const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  let client;
  
  try {
    console.log('🚀 Starting Public Chat Multi-Support Migration...');
    console.log('🔗 Connecting to database...');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '010_add_public_chat_title.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Public Chat Multi-Support Migration completed successfully!');
    console.log('📊 New features added:');
    console.log('   - Title and summary fields for PublicChat table');
    console.log('   - Basic indexes for multi-chat queries');
    
    // Verify columns were added
    const columnCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'PublicChat' 
      AND column_name IN ('title', 'summary')
      ORDER BY column_name
    `);
    
    console.log('🔍 Verification - New columns added:');
    columnCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.column_name} (${row.data_type})`);
    });
    
    // Check indexes
    const indexesCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'PublicChat' 
      AND indexname LIKE 'idx_publicchat_%'
      ORDER BY indexname
    `);
    
    console.log('🔍 Verification - New indexes created:');
    indexesCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.indexname}`);
    });
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Update publicChatController.ts to use new multi-chat functionality');
    console.log('   2. Update frontend to support multiple chats per visitor');
    console.log('   3. Test creating multiple chats with the same twin');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
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