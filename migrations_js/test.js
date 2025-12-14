const { Pool } = require('pg');
const fs = require('fs');
const path = require('path'); // This was missing!
require('dotenv').config();

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
pool.query(`
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('style_anchors', 'mem_chunks', 'style_corrections', 'ai_runs')
  ORDER BY table_name
`).then(result => {
  console.log('✅ Style Learning Tables:');
  result.rows.forEach(row => console.log('  -', row.table_name));
  if (result.rows.length === 4) {
    console.log('🎉 Phase 1 COMPLETE - All tables created!');
  } else {
    console.log('❌ Phase 1 INCOMPLETE - Missing tables');
  }
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});