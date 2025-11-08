const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'aitwin',
  password: 'password',
  port: 5432,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database migration...');
    
    // Check if columns already exist
    const checkUserColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name IN ('personaData', 'onboardingCompleted', 'updatedAt')
    `);
    
    const checkTwinColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Twin' AND column_name IN ('personaData', 'systemPrompt', 'tokenLimit', 'tier', 'updatedAt')
    `);
    
    console.log('Existing User columns:', checkUserColumns.rows.map(r => r.column_name));
    console.log('Existing Twin columns:', checkTwinColumns.rows.map(r => r.column_name));
    
    // Add missing User columns
    if (!checkUserColumns.rows.find(r => r.column_name === 'personaData')) {
      await client.query('ALTER TABLE "User" ADD COLUMN "personaData" JSON');
      console.log('Added personaData column to User table');
    }
    
    if (!checkUserColumns.rows.find(r => r.column_name === 'onboardingCompleted')) {
      await client.query('ALTER TABLE "User" ADD COLUMN "onboardingCompleted" BOOLEAN DEFAULT false');
      console.log('Added onboardingCompleted column to User table');
    }
    
    if (!checkUserColumns.rows.find(r => r.column_name === 'updatedAt')) {
      await client.query('ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
      console.log('Added updatedAt column to User table');
    }
    
    // Add missing Twin columns
    if (!checkTwinColumns.rows.find(r => r.column_name === 'personaData')) {
      await client.query('ALTER TABLE "Twin" ADD COLUMN "personaData" JSON');
      console.log('Added personaData column to Twin table');
    }
    
    if (!checkTwinColumns.rows.find(r => r.column_name === 'systemPrompt')) {
      await client.query('ALTER TABLE "Twin" ADD COLUMN "systemPrompt" TEXT');
      console.log('Added systemPrompt column to Twin table');
    }
    
    if (!checkTwinColumns.rows.find(r => r.column_name === 'tokenLimit')) {
      await client.query('ALTER TABLE "Twin" ADD COLUMN "tokenLimit" INTEGER DEFAULT 500');
      console.log('Added tokenLimit column to Twin table');
    }
    
    if (!checkTwinColumns.rows.find(r => r.column_name === 'tier')) {
      await client.query('ALTER TABLE "Twin" ADD COLUMN "tier" VARCHAR(50) DEFAULT \'free\'');
      console.log('Added tier column to Twin table');
    }
    
    if (!checkTwinColumns.rows.find(r => r.column_name === 'updatedAt')) {
      await client.query('ALTER TABLE "Twin" ADD COLUMN "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
      console.log('Added updatedAt column to Twin table');
    }
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();