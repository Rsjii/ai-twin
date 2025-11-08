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
    console.log('🚀 Starting Chat Management Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '008_add_chat_management.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Chat Management Migration completed successfully!');
    console.log('📊 New features added:');
    console.log('   - Chat titles and summaries');
    console.log('   - Last message tracking');
    console.log('   - Message count tracking');
    console.log('   - Performance indexes');
    
    // Verify columns were added
    const columnsCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Chat' 
      AND column_name IN ('title', 'summary', 'lastMessage', 'messageCount')
      ORDER BY column_name
    `);
    
    console.log('🔍 Verification - Columns added to Chat table:');
    columnsCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.column_name} (${row.data_type})`);
    });
    
    // Check indexes
    const indexesCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'Chat' 
      AND indexname LIKE 'idx_chat_%'
      ORDER BY indexname
    `);
    
    console.log('🔍 Verification - Indexes created:');
    indexesCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.indexname}`);
    });
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Test the new chat history functionality');
    console.log('   2. Verify chat titles are auto-generated');
    console.log('   3. Test chat switching between different conversations');
    console.log('   4. Proceed to Phase 2: Enhanced Training Dashboard');
    
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