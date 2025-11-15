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
    console.log('🚀 Starting Remove Redundant Privacy Fields Migration (021)...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'backend', 'migrations', '021_remove_redundant_privacy_fields.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Check columns before removal
    console.log('\n🔍 Checking columns before removal...');
    const beforeCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Twin' 
      AND column_name IN ('allowPublicChat', 'allowAnonymousChat', 'moderateMessages', 'allowDirectMessages')
      ORDER BY column_name
    `);
    
    if (beforeCheck.rows.length > 0) {
      console.log('📋 Columns to be removed:');
      beforeCheck.rows.forEach(row => {
        console.log(`   - ${row.column_name}`);
      });
    } else {
      console.log('ℹ️  All redundant columns already removed (or never existed)');
    }
    
    // Execute the migration
    console.log('\n⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Migration executed successfully!');
    console.log('📊 Changes applied:');
    console.log('   - Removed allowPublicChat column (use isPublic instead)');
    console.log('   - Removed allowAnonymousChat column (use requireLogin instead)');
    console.log('   - Removed moderateMessages column (use requireApproval instead)');
    console.log('   - Removed allowDirectMessages column (feature doesn\'t exist)');
    
    // Verify columns were removed
    console.log('\n🔍 Verifying migration...');
    
    const afterCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Twin' 
      AND column_name IN ('allowPublicChat', 'allowAnonymousChat', 'moderateMessages', 'allowDirectMessages')
      ORDER BY column_name
    `);
    
    if (afterCheck.rows.length === 0) {
      console.log('✅ All redundant columns successfully removed!');
    } else {
      console.warn('⚠️  Warning: Some columns still exist:');
      afterCheck.rows.forEach(row => {
        console.warn(`   - ${row.column_name}`);
      });
    }
    
    // Verify remaining privacy columns still exist
    console.log('\n🔍 Verifying remaining privacy columns...');
    const remainingCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Twin' 
      AND column_name IN ('showChatHistory', 'requireLogin', 'allowLikes', 'allowFollows', 'allowShares', 'isPublic', 'requireApproval')
      ORDER BY column_name
    `);
    
    if (remainingCheck.rows.length > 0) {
      console.log('✅ Remaining privacy columns:');
      remainingCheck.rows.forEach(row => {
        console.log(`   ✅ ${row.column_name} (${row.data_type})`);
      });
    }
    
    // Show summary
    console.log('\n📋 Migration Summary:');
    console.log(`   - Columns removed: ${beforeCheck.rows.length}`);
    console.log(`   - Columns remaining: ${remainingCheck.rows.length}`);
    console.log(`   - Status: ${afterCheck.rows.length === 0 ? '✅ Success' : '⚠️  Partial'}`);
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Update frontend to remove redundant toggles (already done)');
    console.log('   3. Use isPublic for public chat control');
    console.log('   4. Use requireLogin for anonymous chat control');
    console.log('   5. Use requireApproval for message moderation');
    
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