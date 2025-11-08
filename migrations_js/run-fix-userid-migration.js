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
    console.log('🚀 Starting UserId Data Type Fix Migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend/migrations/007_fix_userid_data_types.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ UserId Data Type Fix Migration completed successfully!');
    console.log('📊 Fixed the following:');
    console.log('   - ChatFeedback.userId: INTEGER → TEXT');
    console.log('   - AILearning.userId: INTEGER → TEXT');
    console.log('   - AILearning.twinId: INTEGER → TEXT');
    console.log('   - Now matches User table schema (TEXT)');
    console.log('   - Feedback API will now work correctly!');
    
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
    console.log('🚀 Feedback functionality is now fixed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration process failed:', error);
    process.exit(1);
  });