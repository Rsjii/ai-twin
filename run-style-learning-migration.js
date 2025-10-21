const { Pool } = require('pg');
const fs = require('fs');
const path = require('path'); // This was missing!
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  let client;
  
  try {
    console.log('🚀 Starting Style Learning Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '004_add_style_learning.sql');
    console.log('📄 Reading migration file:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Migration file loaded successfully');
    
    // Execute the migration
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Style Learning Migration completed successfully!');
    console.log('📊 New tables created:');
    console.log('   - style_anchors (few-shot learning)');
    console.log('   - mem_chunks (memory system)');
    console.log('   - style_corrections (user feedback)');
    console.log('   - ai_runs (quality tracking)');
    console.log('   - mem_bucket enum type');
    
    // Verify tables were created
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('style_anchors', 'mem_chunks', 'style_corrections', 'ai_runs')
      ORDER BY table_name
    `);
    
    console.log('🔍 Verification - Tables created:');
    tablesCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });
    
    // Check enum type
    const enumCheck = await client.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typname = 'mem_bucket'
    `);
    
    if (enumCheck.rows.length > 0) {
      console.log('   ✅ mem_bucket enum type');
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Update your database.ts with new query functions');
    console.log('   2. Update your interfaces.ts with new types');
    console.log('   3. Test the new tables with sample data');
    console.log('   4. Proceed to Phase 2: Style Anchors System');
    
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