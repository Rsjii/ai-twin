const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkDatabaseSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking database schema for enhanced onboarding...');
    
    // Check User table columns
    const userColumnsQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      ORDER BY ordinal_position;
    `;
    
    const userColumns = await client.query(userColumnsQuery);
    console.log('\n📋 User table columns:');
    userColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Check Twin table columns
    const twinColumnsQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'Twin' 
      ORDER BY ordinal_position;
    `;
    
    const twinColumns = await client.query(twinColumnsQuery);
    console.log('\n🤖 Twin table columns:');
    twinColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Check for required columns
    const requiredUserColumns = ['personaData', 'onboardingCompleted', 'updatedAt'];
    const requiredTwinColumns = ['personaData', 'systemPrompt', 'tokenLimit', 'tier', 'updatedAt'];
    
    const userColumnNames = userColumns.rows.map(row => row.column_name);
    const twinColumnNames = twinColumns.rows.map(row => row.column_name);
    
    console.log('\n✅ Checking required columns:');
    
    let missingColumns = [];
    
    requiredUserColumns.forEach(col => {
      if (userColumnNames.includes(col)) {
        console.log(`  ✅ User.${col} - EXISTS`);
      } else {
        console.log(`  ❌ User.${col} - MISSING`);
        missingColumns.push(`User.${col}`);
      }
    });
    
    requiredTwinColumns.forEach(col => {
      if (twinColumnNames.includes(col)) {
        console.log(`  ✅ Twin.${col} - EXISTS`);
      } else {
        console.log(`  ❌ Twin.${col} - MISSING`);
        missingColumns.push(`Twin.${col}`);
      }
    });
    
    if (missingColumns.length > 0) {
      console.log('\n🚨 MISSING COLUMNS DETECTED!');
      console.log('Missing columns:', missingColumns.join(', '));
      console.log('\n💡 SOLUTION: Run the database migration:');
      console.log('   node run-enhanced-onboarding-migration.js');
    } else {
      console.log('\n🎉 All required columns exist! Database schema is ready.');
    }
    
  } catch (error) {
    console.error('❌ Error checking database schema:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDatabaseSchema();
