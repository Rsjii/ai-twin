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
    console.log('🔄 Running MemorySession migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'backend/migrations/013_add_memory_session.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ MemorySession migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();