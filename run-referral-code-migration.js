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
    console.log('🚀 Starting Referral Code Migration...');
    console.log('🔗 Connecting to database...');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '011_add_referral_code.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Referral Code Migration completed successfully!');
    
    // Verify column was added
    const columnCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      AND column_name = 'referralCode'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('🔍 Verification - Column added to User table:');
      console.log(`   ✅ ${columnCheck.rows[0].column_name} (${columnCheck.rows[0].data_type})`);
    }
    
    // Check index
    const indexCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'User' 
      AND indexname = 'User_referralCode_idx'
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('🔍 Verification - Index created:');
      console.log(`   ✅ ${indexCheck.rows[0].indexname}`);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 New functionality added:');
    console.log('   - Each user gets a unique referralCode');
    console.log('   - Users can share their referral link');
    console.log('   - Referrals are tracked in Invite table');
    console.log('   - Analytics endpoint available at /api/analytics/referrals');
    
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