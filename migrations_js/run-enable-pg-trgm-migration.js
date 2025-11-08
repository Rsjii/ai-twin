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
    console.log('🚀 Starting pg_trgm Extension Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '017_enable_pg_trgm.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ pg_trgm Extension Migration completed successfully!');
    console.log('📊 Changes applied:');
    console.log('   - pg_trgm extension enabled');
    console.log('   - GIN index created on style_anchors.user_utterance');
    
    // Verify extension was created
    const extensionCheck = await client.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'pg_trgm'
    `);
    
    if (extensionCheck.rows.length > 0) {
      console.log('🔍 Verification - Extension enabled:');
      console.log(`   ✅ ${extensionCheck.rows[0].extname} (version ${extensionCheck.rows[0].extversion})`);
    } else {
      console.warn('⚠️  Warning: Extension not found after migration');
    }
    
    // Verify index was created
    const indexCheck = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'style_anchors' 
      AND indexname = 'idx_style_anchors_user_utterance_trgm'
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('🔍 Verification - Index created:');
      console.log(`   ✅ ${indexCheck.rows[0].indexname}`);
    } else {
      console.warn('⚠️  Warning: Index not found after migration');
    }
    
    // Test similarity function
    console.log('\n🧪 Testing similarity function...');
    try {
      const testResult = await client.query(`
        SELECT similarity('hello world', 'hello') as sim_score
      `);
      console.log(`   ✅ Similarity function working! Test score: ${testResult.rows[0].sim_score}`);
    } catch (testError) {
      console.error('   ❌ Similarity function test failed:', testError.message);
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Test style_anchors similarity queries');
    console.log('   3. The similarity() error should be fixed now');
    
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