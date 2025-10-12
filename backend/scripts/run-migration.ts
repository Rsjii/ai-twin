import { db } from '../src/config/database';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  try {
    console.log('🚀 Starting database migration...');
    
    // Read the migration file
    const migrationPath = join(__dirname, '../migrations/001_add_public_twin_features.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
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

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('🎉 Migration process completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration process failed:', error);
      process.exit(1);
    });
}

export { runMigration };
