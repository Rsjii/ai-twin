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
    console.log('🚀 Starting Chat Feedback Migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'backend/migrations/006_add_chat_feedback_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    console.log('✅ Chat Feedback Migration completed successfully!');
    console.log('📊 Added the following features:');
    console.log('   - ChatFeedback table for user feedback storage');
    console.log('   - AILearning table for AI learning data');
    console.log('   - Support for ChatGPT-like features:');
    console.log('     • 👍 Upvote/Downvote responses');
    console.log('     • 💬 User suggestions and feedback');
    console.log('     • 🎨 Tone preference adjustments');
    console.log('     • 🔄 Response regeneration');
    console.log('     • 📋 Copy and share responses');
    console.log('   - AI learning from user feedback');
    console.log('   - Response regeneration with tone preferences');
    
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
    console.log('🎉 Migration process completed!');
    console.log('🚀 Your ChatGPT-like features are now ready to use!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration process failed:', error);
    process.exit(1);
  });