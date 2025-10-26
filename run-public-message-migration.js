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
    console.log('🚀 Starting PublicMessage Table Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '009_add_public_message_table.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ PublicMessage Table Migration completed successfully!');
    console.log('📊 New features added:');
    console.log('   - PublicMessage table for public chat messages');
    console.log('   - Foreign key constraint to PublicChat table');
    console.log('   - Performance indexes for chat queries');
    console.log('   - Proper message sender enum support');
    
    // Verify table was created
    const tableCheck = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'PublicMessage' 
      ORDER BY ordinal_position
    `);
    
    console.log('🔍 Verification - PublicMessage table structure:');
    tableCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.column_name} (${row.data_type})`);
    });
    
    // Check indexes
    const indexesCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'PublicMessage' 
      ORDER BY indexname
    `);
    
    console.log('🔍 Verification - Indexes created:');
    indexesCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.indexname}`);
    });
    
    // Check foreign key constraint
    const fkCheck = await client.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints 
      WHERE table_name = 'PublicMessage' 
      AND constraint_type = 'FOREIGN KEY'
    `);
    
    console.log('🔍 Verification - Foreign key constraints:');
    fkCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.constraint_name} (${row.constraint_type})`);
    });
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Update publicChatController.ts to use PublicMessage table');
    console.log('   2. Test public chat functionality');
    console.log('   3. Verify messages are stored correctly');
    console.log('   4. Test AI response generation in public chats');
    
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