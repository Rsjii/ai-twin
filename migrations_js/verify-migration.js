const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function verifyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verifying migration...');
    console.log('='.repeat(60));
    
    // 1. Check mem_chunks data
    const memChunksCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mem_chunks'
      );
    `);
    
    if (memChunksCheck.rows[0].exists) {
      const memChunksCount = await client.query(`
        SELECT bucket, COUNT(*) as count
        FROM mem_chunks
        GROUP BY bucket
      `);
      
      console.log('\n📊 mem_chunks table (source):');
      memChunksCount.rows.forEach(row => {
        console.log(`   ${row.bucket}: ${row.count} records`);
      });
    } else {
      console.log('\n📊 mem_chunks table: Does not exist (already removed)');
    }
    
    // 2. Check MemoryLongTerm migrated data
    const longTermCount = await client.query(`
      SELECT 
        source,
        category,
        COUNT(*) as count
      FROM "MemoryLongTerm"
      GROUP BY source, category
      ORDER BY source, category
    `);
    
    console.log('\n📊 MemoryLongTerm table (destination):');
    longTermCount.rows.forEach(row => {
      console.log(`   ${row.source || 'unknown'} - ${row.category}: ${row.count} records`);
    });
    
    // 3. Check style_anchors migrated data
    const anchorsCount = await client.query(`
      SELECT 
        type,
        COUNT(*) as count,
        COUNT(CASE WHEN 'migrated' = ANY(tags) THEN 1 END) as migrated_count
      FROM "style_anchors"
      GROUP BY type
      ORDER BY type
    `);
    
    console.log('\n📊 style_anchors table (destination):');
    anchorsCount.rows.forEach(row => {
      console.log(`   ${row.type}: ${row.count} total (${row.migrated_count} migrated)`);
    });
    
    // 4. Sample verification
    console.log('\n🔍 Sample verification:');
    
    const sampleFacts = await client.query(`
      SELECT "twinId", key, value, category, source
      FROM "MemoryLongTerm"
      WHERE source = 'migration'
      LIMIT 5
    `);
    
    console.log('\n   Sample migrated facts:');
    sampleFacts.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. Twin ${row.twinId}: "${row.value.substring(0, 50)}..."`);
    });
    
    const sampleVoice = await client.query(`
      SELECT twin_id, type, phrase, tags
      FROM "style_anchors"
      WHERE 'migrated' = ANY(tags)
      LIMIT 5
    `);
    
    console.log('\n   Sample migrated voice patterns:');
    sampleVoice.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. Twin ${row.twin_id}: "${row.phrase.substring(0, 50)}..."`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Verification completed');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyMigration()
  .then(() => {
    console.log('\n✅ Verification script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification script failed:', error);
    process.exit(1);
  });