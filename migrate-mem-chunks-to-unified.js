const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function generateId() {
  return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function migrateData() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting data migration from mem_chunks to unified system...');
    
    // 1. Migrate mem_chunks.facts → MemoryLongTerm
    console.log('\n1️⃣ Migrating facts to MemoryLongTerm...');
    const factsResult = await client.query(`
      SELECT DISTINCT ON (twin_id, text) 
        twin_id, text, ts
      FROM mem_chunks
      WHERE bucket = 'facts'
      ORDER BY twin_id, text, ts DESC
    `);
    
    let factsMigrated = 0;
    for (const row of factsResult.rows) {
      const key = `fact_migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const id = generateId();
      
      try {
        await client.query(`
          INSERT INTO "MemoryLongTerm" (id, "twinId", key, value, category, source, "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT ("twinId", key) DO NOTHING
        `, [id, row.twin_id, key, row.text, 'fact', 'migration', row.ts]);
        factsMigrated++;
      } catch (err) {
        // Skip duplicates
        continue;
      }
    }
    console.log(`   ✅ Migrated ${factsMigrated} facts`);
    
    // 2. Migrate mem_chunks.voice → style_anchors (as phrases)
    console.log('\n2️⃣ Migrating voice patterns to style_anchors...');
    const voiceResult = await client.query(`
      SELECT DISTINCT ON (twin_id, text) 
        twin_id, text, ts
      FROM mem_chunks
      WHERE bucket = 'voice'
      ORDER BY twin_id, text, ts DESC
    `);
    
    let voiceMigrated = 0;
    for (const row of voiceResult.rows) {
      const id = generateId();
      
      try {
        await client.query(`
          INSERT INTO "style_anchors" (id, twin_id, type, phrase, tags, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING
        `, [id, row.twin_id, 'phrase', row.text, ['migrated'], row.ts]);
        voiceMigrated++;
      } catch (err) {
        // Skip duplicates
        continue;
      }
    }
    console.log(`   ✅ Migrated ${voiceMigrated} voice patterns`);
    
    console.log('\n✅ Data migration completed successfully!');
    console.log(`   Total: ${factsMigrated} facts + ${voiceMigrated} voice patterns migrated`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateData();