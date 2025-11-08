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
    console.log('🚀 Starting requireApproval Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '019_add_require_approval.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ requireApproval Migration completed successfully!');
    console.log('📊 Changes applied:');
    console.log('   - Added requireApproval column to ModerationSettings table');
    console.log('   - Added requireApproval column to Twin table');
    console.log('   - Created index on ModerationSettings.requireApproval');
    
    // Verify columns were created
    console.log('\n🔍 Verifying migration...');
    
    // Check ModerationSettings table
    const moderationSettingsCheck = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'ModerationSettings' 
      AND column_name = 'requireApproval'
    `);
    
    if (moderationSettingsCheck.rows.length > 0) {
      console.log('✅ ModerationSettings.requireApproval column exists:');
      console.log(`   - Type: ${moderationSettingsCheck.rows[0].data_type}`);
      console.log(`   - Default: ${moderationSettingsCheck.rows[0].column_default}`);
    } else {
      console.warn('⚠️  Warning: ModerationSettings.requireApproval column not found');
    }
    
    // Check Twin table
    const twinCheck = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'Twin' 
      AND column_name = 'requireApproval'
    `);
    
    if (twinCheck.rows.length > 0) {
      console.log('✅ Twin.requireApproval column exists:');
      console.log(`   - Type: ${twinCheck.rows[0].data_type}`);
      console.log(`   - Default: ${twinCheck.rows[0].column_default}`);
    } else {
      console.warn('⚠️  Warning: Twin.requireApproval column not found');
    }
    
    // Check index
    const indexCheck = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'ModerationSettings' 
      AND indexname = 'idx_moderation_settings_requireapproval'
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('✅ Index created:');
      console.log(`   - ${indexCheck.rows[0].indexname}`);
    } else {
      console.warn('⚠️  Warning: Index not found after migration');
    }
    
    // Show current default values
    console.log('\n📋 Current default values:');
    const defaultCheck = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM "ModerationSettings" WHERE "requireApproval" = false OR "requireApproval" IS NULL) as moderation_false,
        (SELECT COUNT(*) FROM "Twin" WHERE "requireApproval" = false OR "requireApproval" IS NULL) as twin_false
    `);
    
    if (defaultCheck.rows.length > 0) {
      console.log(`   - ModerationSettings with requireApproval=false: ${defaultCheck.rows[0].moderation_false}`);
      console.log(`   - Twin records with requireApproval=false: ${defaultCheck.rows[0].twin_false}`);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Messages will now be moderated based on requireApproval flag');
    console.log('   3. Set requireApproval=true in ModerationSettings for strict moderation');
    console.log('   4. Set requireApproval=true on Twin for per-twin moderation control');
    
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

