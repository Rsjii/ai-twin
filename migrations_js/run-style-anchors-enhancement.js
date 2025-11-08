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
    console.log('🔄 Running Style Anchors enhancement migration...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'backend/migrations/015_enhance_style_anchors.sql'),
      'utf8'
    );
    
    await client.query(migrationSQL);
    
    console.log('✅ Style Anchors enhancement completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();