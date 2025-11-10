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
    await client.query('BEGIN');
    
    console.log('🔄 Starting data migration from mem_chunks to unified system...');
    console.log('='.repeat(60));
    
    // Check if mem_chunks table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mem_chunks'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  mem_chunks table does not exist. Nothing to migrate.');
      await client.query('COMMIT');
      return;
    }
    
    // Get counts before migration
    const beforeCounts = await client.query(`
      SELECT 
        bucket,
        COUNT(*) as count
      FROM mem_chunks
      GROUP BY bucket
    `);
    
    console.log('\n📊 Current mem_chunks data:');
    beforeCounts.rows.forEach(row => {
      console.log(`   ${row.bucket}: ${row.count} records`);
    });
    
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
    let factsSkipped = 0;
    
    for (const row of factsResult.rows) {
      const key = `fact_migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const id = generateId();
      
      try {
        // Check if twin exists
        const twinCheck = await client.query(
          'SELECT id FROM "Twin" WHERE id = $1',
          [row.twin_id]
        );
        
        if (twinCheck.rows.length === 0) {
          console.log(`   ⚠️  Skipping fact for non-existent twin: ${row.twin_id}`);
          factsSkipped++;
          continue;
        }
        
        await client.query(`
          INSERT INTO "MemoryLongTerm" (id, "twinId", key, value, category, source, "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          ON CONFLICT ("twinId", key) DO NOTHING
        `, [id, row.twin_id, key, row.text, 'fact', 'migration', row.ts || new Date()]);
        
        if (await client.query('SELECT 1 FROM "MemoryLongTerm" WHERE id = $1', [id]).then(r => r.rows.length > 0)) {
          factsMigrated++;
        } else {
          factsSkipped++;
        }
      } catch (err) {
        console.error(`   ❌ Error migrating fact: ${err.message}`);
        factsSkipped++;
      }
    }
    console.log(`   ✅ Migrated: ${factsMigrated} facts`);
    if (factsSkipped > 0) {
      console.log(`   ⚠️  Skipped: ${factsSkipped} facts (duplicates or errors)`);
    }
    
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
    let voiceSkipped = 0;
    
    for (const row of voiceResult.rows) {
      const id = generateId();
      
      try {
        // Check if twin exists
        const twinCheck = await client.query(
          'SELECT id FROM "Twin" WHERE id = $1',
          [row.twin_id]
        );
        
        if (twinCheck.rows.length === 0) {
          console.log(`   ⚠️  Skipping voice pattern for non-existent twin: ${row.twin_id}`);
          voiceSkipped++;
          continue;
        }
        
        await client.query(`
          INSERT INTO "style_anchors" (id, twin_id, type, phrase, user_utterance, ideal_reply, tags, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
        `, [
          id, 
          row.twin_id, 
          'phrase', 
          row.text, 
          '', 
          '', 
          ['migrated'], 
          row.ts || new Date()
        ]);
        
        if (await client.query('SELECT 1 FROM "style_anchors" WHERE id = $1', [id]).then(r => r.rows.length > 0)) {
          voiceMigrated++;
        } else {
          voiceSkipped++;
        }
      } catch (err) {
        console.error(`   ❌ Error migrating voice pattern: ${err.message}`);
        voiceSkipped++;
      }
    }
    console.log(`   ✅ Migrated: ${voiceMigrated} voice patterns`);
    if (voiceSkipped > 0) {
      console.log(`   ⚠️  Skipped: ${voiceSkipped} voice patterns (duplicates or errors)`);
    }
    
    // Verify migration
    console.log('\n3️⃣ Verifying migration...');
    const afterFacts = await client.query(`
      SELECT COUNT(*) as count 
      FROM "MemoryLongTerm" 
      WHERE source = 'migration'
    `);
    
    const afterVoice = await client.query(`
      SELECT COUNT(*) as count 
      FROM "style_anchors" 
      WHERE 'migrated' = ANY(tags)
    `);
    
    console.log(`   ✅ MemoryLongTerm (migrated): ${afterFacts.rows[0].count}`);
    console.log(`   ✅ style_anchors (migrated): ${afterVoice.rows[0].count}`);
    
    await client.query('COMMIT');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Data migration completed successfully!');
    console.log(`   Total migrated: ${factsMigrated} facts + ${voiceMigrated} voice patterns`);
    console.log(`   Total skipped: ${factsSkipped + voiceSkipped} records`);
    console.log('='.repeat(60));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error);
    console.error('   Transaction rolled back. No data was changed.');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrateData()
  .then(() => {
    console.log('\n✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });