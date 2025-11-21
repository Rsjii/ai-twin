require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Get connection string
let connectionString = process.env.DATABASE_URL || '';
if (connectionString.includes('?')) {
  connectionString = `${connectionString}&timezone=UTC`;
} else {
  connectionString = `${connectionString}?timezone=UTC`;
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('Running Migration: Convert TIMESTAMP to TIMESTAMPTZ');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Read migration file
    const migrationFile = path.join(__dirname, 'migrations', '023_convert_timestamps_to_timestamptz.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('📄 Migration file:', migrationFile);
    console.log('📝 SQL content:\n', sql);
    console.log('\n🚀 Executing migration...\n');
    
    // Execute migration
    await client.query(sql);
    
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    
    // Verify changes
    console.log('\n🔍 Verifying column types...\n');
    
    const verifyQuery = `
      SELECT 
        table_name,
        column_name,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_name IN ('PublicMessage', 'PublicChat', 'Message')
        AND column_name IN ('createdAt', 'lastActivity')
      ORDER BY table_name, column_name;
    `;
    
    const result = await client.query(verifyQuery);
    
    console.log('Column types after migration:');
    console.table(result.rows);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);