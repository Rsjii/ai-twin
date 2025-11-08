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
    console.log('🚀 Starting PublicChat userId Migration...');
    console.log('🔗 Connecting to database...');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '012_add_userid_to_publicchat.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ PublicChat userId Migration completed successfully!');
    
    // Verify column was added
    const columnCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'PublicChat' 
      AND column_name = 'userId'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('🔍 Verification - Column added to PublicChat table:');
      console.log(`   ✅ ${columnCheck.rows[0].column_name} (${columnCheck.rows[0].data_type})`);
    } else {
      console.log('⚠️  Warning: userId column not found in PublicChat table');
    }
    
    // Check primary index
    const indexCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'PublicChat' 
      AND indexname = 'idx_publicchat_userid'
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('🔍 Verification - Primary index created:');
      console.log(`   ✅ ${indexCheck.rows[0].indexname}`);
    } else {
      console.log('⚠️  Warning: idx_publicchat_userid index not found');
    }
    
    // Check composite index
    const compositeIndexCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'PublicChat' 
      AND indexname = 'idx_publicchat_userid_twinid'
    `);
    
    if (compositeIndexCheck.rows.length > 0) {
      console.log('🔍 Verification - Composite index created:');
      console.log(`   ✅ ${compositeIndexCheck.rows[0].indexname}`);
    } else {
      console.log('⚠️  Warning: idx_publicchat_userid_twinid index not found');
    }
    
    // Check existing data migration
    const dataCheck = await client.query(`
      SELECT COUNT(*) as total_chats,
             COUNT("userId") as chats_with_userid,
             COUNT("visitorId") as chats_with_visitorid
      FROM "PublicChat"
    `);
    
    if (dataCheck.rows.length > 0) {
      const stats = dataCheck.rows[0];
      console.log('\n📊 PublicChat table statistics:');
      console.log(`   Total chats: ${stats.total_chats}`);
      console.log(`   Chats with userId: ${stats.chats_with_userid}`);
      console.log(`   Chats with visitorId: ${stats.chats_with_visitorid}`);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 New functionality added:');
    console.log('   - PublicChat table now has userId column for logged-in users');
    console.log('   - Indexes created for fast user-based queries');
    console.log('   - Existing visitorId values migrated to userId if they match User IDs');
    console.log('   - Anonymous visitors continue using visitorId');
    console.log('   - API endpoint /api/public-chat/user/my-chats can now fetch user chats');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.position) {
      console.error('Error position:', error.position);
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