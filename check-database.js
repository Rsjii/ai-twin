const { Pool } = require('pg');

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.ovqfpobyqbbquvfxhibi:WzKZY+gg.H74hqZ@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkDatabase() {
  try {
    console.log('🔍 Checking database structure...');
    
    // Check if Twin table has public twin columns
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'Twin' 
      AND column_name IN ('isPublic', 'publicHandle', 'bio', 'profileImage', 'verified', 'likeCount', 'followCount', 'chatCount')
      ORDER BY column_name
    `);
    
    console.log('📊 Twin table public columns:');
    if (result.rows.length === 0) {
      console.log('❌ No public twin columns found! Migration not run.');
    } else {
      result.rows.forEach(row => {
        console.log(`✅ ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    }
    
    // Check if public twin tables exist
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('TwinLike', 'TwinFollow', 'PublicChat')
      ORDER BY table_name
    `);
    
    console.log('\n📋 Public twin tables:');
    if (tablesResult.rows.length === 0) {
      console.log('❌ No public twin tables found! Migration not run.');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`✅ ${row.table_name} table exists`);
      });
    }
    
    // Check if there are any twins in the database
    const twinsResult = await db.query('SELECT COUNT(*) as count FROM "Twin"');
    console.log(`\n👥 Total twins in database: ${twinsResult.rows[0].count}`);
    
    // Check if any twins are public
    const publicTwinsResult = await db.query('SELECT COUNT(*) as count FROM "Twin" WHERE "isPublic" = true');
    console.log(`🌐 Public twins: ${publicTwinsResult.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    await db.end();
  }
}

checkDatabase();
