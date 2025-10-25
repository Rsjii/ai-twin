const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runTwinTrackingMigration() {
  let client;
  
  try {
    console.log('🚀 Starting Twin Tracking Migration...');
    console.log('🔗 Connecting to database...');
    console.log('📡 DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Check if columns already exist
    const checkTwinColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Twin' AND column_name IN ('last_updated', 'style_version')
    `);
    
    const checkMemColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'mem_chunks' AND column_name = 'is_public'
    `);
    
    const checkAiRunsColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ai_runs' AND column_name IN ('feedback_score', 'user_rating')
    `);
    
    console.log('Existing Twin columns:', checkTwinColumns.rows.map(r => r.column_name));
    console.log('Existing mem_chunks columns:', checkMemColumns.rows.map(r => r.column_name));
    console.log('Existing ai_runs columns:', checkAiRunsColumns.rows.map(r => r.column_name));
    
    // Add tracking columns to Twin table
    if (!checkTwinColumns.rows.find(r => r.column_name === 'last_updated')) {
      await client.query('ALTER TABLE "Twin" ADD COLUMN "last_updated" TIMESTAMPTZ DEFAULT NOW()');
      console.log('✅ Added last_updated column to Twin table');
    } else {
      console.log('⚠️ last_updated column already exists');
    }
    
    if (!checkTwinColumns.rows.find(r => r.column_name === 'style_version')) {
      await client.query('ALTER TABLE "Twin" ADD COLUMN "style_version" INTEGER DEFAULT 1');
      console.log('✅ Added style_version column to Twin table');
    } else {
      console.log('⚠️ style_version column already exists');
    }
    
    // Add public/private memory flag to mem_chunks
    if (!checkMemColumns.rows.find(r => r.column_name === 'is_public')) {
      await client.query('ALTER TABLE "mem_chunks" ADD COLUMN "is_public" BOOLEAN DEFAULT FALSE');
      console.log('✅ Added is_public column to mem_chunks table');
    } else {
      console.log('⚠️ is_public column already exists');
    }
    
    // Add feedback tracking to ai_runs
    if (!checkAiRunsColumns.rows.find(r => r.column_name === 'feedback_score')) {
      await client.query('ALTER TABLE "ai_runs" ADD COLUMN "feedback_score" INTEGER');
      console.log('✅ Added feedback_score column to ai_runs table');
    } else {
      console.log('⚠️ feedback_score column already exists');
    }
    
    if (!checkAiRunsColumns.rows.find(r => r.column_name === 'user_rating')) {
      await client.query('ALTER TABLE "ai_runs" ADD COLUMN "user_rating" TEXT');
      console.log('✅ Added user_rating column to ai_runs table');
    } else {
      console.log('⚠️ user_rating column already exists');
    }
    
    // Create indexes for performance
    try {
      await client.query('CREATE INDEX IF NOT EXISTS "idx_twin_last_updated" ON "Twin"("last_updated")');
      console.log('✅ Created index on Twin.last_updated');
    } catch (error) {
      console.log('⚠️ Index idx_twin_last_updated might already exist');
    }
    
    try {
      await client.query('CREATE INDEX IF NOT EXISTS "idx_mem_chunks_public" ON "mem_chunks"("is_public")');
      console.log('✅ Created index on mem_chunks.is_public');
    } catch (error) {
      console.log('⚠️ Index idx_mem_chunks_public might already exist');
    }
    
    console.log('🎉 Twin Tracking Migration completed successfully!');
    console.log('📊 New columns added:');
    console.log('   - Twin.last_updated (tracking)');
    console.log('   - Twin.style_version (versioning)');
    console.log('   - mem_chunks.is_public (privacy)');
    console.log('   - ai_runs.feedback_score (feedback)');
    console.log('   - ai_runs.user_rating (rating)');
    
    // Verify columns were added
    const finalCheck = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('Twin', 'mem_chunks', 'ai_runs')
      AND column_name IN ('last_updated', 'style_version', 'is_public', 'feedback_score', 'user_rating')
      ORDER BY table_name, column_name
    `);
    
    console.log('🔍 Verification - Columns added:');
    finalCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}.${row.column_name}`);
    });
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Test the new twin edit endpoints');
    console.log('   2. Test the feedback system');
    console.log('   3. Verify database schema changes');
    
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
runTwinTrackingMigration()
  .then(() => {
    console.log('🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });