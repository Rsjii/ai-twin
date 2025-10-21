const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting chatVector migration...');
    
    // Add chatVector to Chat table for compressed chat history
    console.log('📝 Adding chatVector column to Chat table...');
    await client.query(`
      ALTER TABLE "Chat" 
      ADD COLUMN IF NOT EXISTS "chatVector" JSONB,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();
    `);
    
    // Create index on chatVector for faster queries
    console.log('🔍 Creating index on chatVector...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_chatvector ON "Chat"("chatVector");
    `);
    
    // Update existing chats to have updatedAt timestamp
    console.log('⏰ Updating existing chats with updatedAt timestamp...');
    await client.query(`
      UPDATE "Chat" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
    `);
    
    console.log('✅ Migration completed successfully!');
    console.log('📊 Summary:');
    console.log('   - Added chatVector JSONB column to Chat table');
    console.log('   - Added updatedAt timestamp column to Chat table');
    console.log('   - Created index for faster chatVector queries');
    console.log('   - Updated existing chats with timestamps');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });
