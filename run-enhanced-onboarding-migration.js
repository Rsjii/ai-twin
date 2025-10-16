const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Enhanced Onboarding Migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend/migrations/002_enhanced_onboarding.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Enhanced Onboarding Migration completed successfully!');
    console.log('📊 Added the following features:');
    console.log('   - Enhanced user persona data storage');
    console.log('   - Onboarding completion tracking');
    console.log('   - Enhanced twin persona data');
    console.log('   - System prompt generation');
    console.log('   - Token limits and tier management');
    console.log('   - Database indexes for performance');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('🎉 Migration process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration process failed:', error);
    process.exit(1);
  });
