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
    console.log('🔄 Running MemoryLongTerm migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'backend/migrations/014_add_memory_longterm.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ MemoryLongTerm migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();