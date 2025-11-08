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
    console.log('🚀 Starting requestId Migration (020)...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '020_add_request_id.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ requestId Migration completed successfully!');
    console.log('📊 Changes applied:');
    console.log('   - Added requestId column to Message table');
    console.log('   - Added requestId column to PublicMessage table');
    console.log('   - Created unique index on Message(chatId, requestId)');
    console.log('   - Created unique index on PublicMessage(chatId, requestId)');
    
    // Verify columns were created
    console.log('\n🔍 Verifying migration...');
    
    // Check Message table
    const messageCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Message' 
      AND column_name = 'requestId'
    `);
    
    if (messageCheck.rows.length > 0) {
      console.log('✅ Message.requestId column exists:');
      console.log(`   - Type: ${messageCheck.rows[0].data_type}`);
    } else {
      console.warn('⚠️  Warning: Message.requestId column not found');
    }
    
    // Check PublicMessage table
    const publicMessageCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'PublicMessage' 
      AND column_name = 'requestId'
    `);
    
    if (publicMessageCheck.rows.length > 0) {
      console.log('✅ PublicMessage.requestId column exists:');
      console.log(`   - Type: ${publicMessageCheck.rows[0].data_type}`);
    } else {
      console.warn('⚠️  Warning: PublicMessage.requestId column not found');
    }
    
    // Check indexes
    const messageIndexCheck = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'Message' 
      AND indexname = 'idx_message_chatid_requestid_unique'
    `);
    
    if (messageIndexCheck.rows.length > 0) {
      console.log('✅ Message index created:');
      console.log(`   - ${messageIndexCheck.rows[0].indexname}`);
    } else {
      console.warn('⚠️  Warning: Message index not found after migration');
    }
    
    const publicMessageIndexCheck = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'PublicMessage' 
      AND indexname = 'idx_publicmessage_chatid_requestid_unique'
    `);
    
    if (publicMessageIndexCheck.rows.length > 0) {
      console.log('✅ PublicMessage index created:');
      console.log(`   - ${publicMessageIndexCheck.rows[0].indexname}`);
    } else {
      console.warn('⚠️  Warning: PublicMessage index not found after migration');
    }
    
    // Show sample data count
    console.log('\n📋 Sample data check:');
    const dataCheck = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM "Message" WHERE "requestId" IS NOT NULL) as messages_with_requestid,
        (SELECT COUNT(*) FROM "PublicMessage" WHERE "requestId" IS NOT NULL) as public_messages_with_requestid
    `);
    
    if (dataCheck.rows.length > 0) {
      console.log(`   - Messages with requestId: ${dataCheck.rows[0].messages_with_requestid}`);
      console.log(`   - PublicMessages with requestId: ${dataCheck.rows[0].public_messages_with_requestid}`);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. New messages will automatically get requestId for idempotency');
    console.log('   3. Duplicate message requests will be detected and prevented');
    
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
    console.log('\n🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });