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
    console.log('🔄 Running TwinPerformance migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'backend/migrations/016_add_twin_performance.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ TwinPerformance migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();