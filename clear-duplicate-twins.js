// clear-duplicate-twins.js
const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.ovqfpobyqbbquvfxhibi:WzKZY+gg.H74hqZ@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function clearDuplicateTwins() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking for duplicate twins...');
    
    // First, let's see how many twins each user has
    const userTwinCounts = await client.query(`
      SELECT 
        u.id as user_id,
        u.email,
        COUNT(t.id) as twin_count
      FROM "User" u
      LEFT JOIN "Twin" t ON u.id = t."userId"
      GROUP BY u.id, u.email
      HAVING COUNT(t.id) > 1
      ORDER BY twin_count DESC
    `);
    
    console.log(`📊 Found ${userTwinCounts.rows.length} users with multiple twins:`);
    userTwinCounts.rows.forEach(row => {
      console.log(`  - ${row.email}: ${row.twin_count} twins`);
    });
    
    if (userTwinCounts.rows.length === 0) {
      console.log('✅ No duplicate twins found! All users have 1 or 0 twins.');
      return;
    }
    
    console.log('\n🗑️  Removing duplicate twins (keeping only the latest for each user)...');
    
    // Delete duplicate twins, keeping only the latest one for each user
    const deleteResult = await client.query(`
      DELETE FROM "Twin" 
      WHERE id NOT IN (
        SELECT DISTINCT ON ("userId") id
        FROM "Twin"
        ORDER BY "userId", "createdAt" DESC
      )
    `);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} duplicate twin entries`);
    
    // Verify the cleanup
    const finalCounts = await client.query(`
      SELECT 
        u.id as user_id,
        u.email,
        COUNT(t.id) as twin_count
      FROM "User" u
      LEFT JOIN "Twin" t ON u.id = t."userId"
      GROUP BY u.id, u.email
      HAVING COUNT(t.id) > 1
    `);
    
    if (finalCounts.rows.length === 0) {
      console.log('✅ Cleanup successful! All users now have at most 1 twin.');
    } else {
      console.log('❌ Some users still have multiple twins. Manual review needed.');
    }
    
    // Show final statistics
    const totalTwins = await client.query('SELECT COUNT(*) as count FROM "Twin"');
    const totalUsers = await client.query('SELECT COUNT(*) as count FROM "User"');
    
    console.log(`\n📈 Final Statistics:`);
    console.log(`  - Total Users: ${totalUsers.rows[0].count}`);
    console.log(`  - Total Twins: ${totalTwins.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the cleanup
clearDuplicateTwins()
  .then(() => {
    console.log('🎉 Twin cleanup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Twin cleanup failed:', error);
    process.exit(1);
  });