const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection - using same config as backend
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.ovqfpobyqbbquvfxhibi:WzKZY+gg.H74hqZ@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  try {
    console.log('🚀 Starting database migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend/migrations/001_add_public_twin_features.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await db.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('📊 New features added:');
    console.log('   - Public twin profiles');
    console.log('   - Like/Follow system');
    console.log('   - Public chat system');
    console.log('   - Engagement metrics');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    // Close database connection
    await db.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('🎉 Migration process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration process failed:', error);
    process.exit(1);
  });
