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
    console.log('🚀 Starting Block Non-Logged Users Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'backend', 'migrations', '022_add_block_non_logged_users.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Block Non-Logged Users Migration completed successfully!');
    console.log('📊 Changes applied:');
    console.log('   - blockNonLoggedUsers column added to Twin table');
    console.log('   - Index created on (blockNonLoggedUsers, isPublic)');
    
    // Verify column was created
    const columnCheck = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'Twin' 
      AND column_name = 'blockNonLoggedUsers'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('🔍 Verification - Column created:');
      console.log(`   ✅ ${columnCheck.rows[0].column_name} (${columnCheck.rows[0].data_type}, default: ${columnCheck.rows[0].column_default})`);
    } else {
      console.warn('⚠️  Warning: Column not found after migration');
    }
    
    // Verify index was created
    const indexCheck = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'Twin' 
      AND indexname = 'idx_twin_block_non_logged'
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('🔍 Verification - Index created:');
      console.log(`   ✅ ${indexCheck.rows[0].indexname}`);
    } else {
      console.warn('⚠️  Warning: Index not found after migration');
    }
    
    // Test query with new column
    console.log('\n🧪 Testing blockNonLoggedUsers column...');
    try {
      const testResult = await client.query(`
        SELECT COUNT(*) as total_twins,
               COUNT(CASE WHEN "blockNonLoggedUsers" = true THEN 1 END) as blocked_twins,
               COUNT(CASE WHEN "blockNonLoggedUsers" = false OR "blockNonLoggedUsers" IS NULL THEN 1 END) as visible_twins
        FROM "Twin"
        WHERE "isPublic" = true
      `);
      console.log(`   ✅ Column working! Total public twins: ${testResult.rows[0].total_twins}`);
      console.log(`   ✅ Blocked from non-logged: ${testResult.rows[0].blocked_twins}`);
      console.log(`   ✅ Visible to non-logged: ${testResult.rows[0].visible_twins}`);
    } catch (testError) {
      console.error('   ❌ Test query failed:', testError.message);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Test privacy settings in profile page');
    console.log('   3. Verify non-logged users cannot see blocked twins');
    
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