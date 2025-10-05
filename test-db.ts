import { db } from './src/config/database';

async function testDatabase() {
  console.log('🔍 TESTING DATABASE...\n');
  
  try {
    // 1. Check all tables exist
    console.log('📋 Checking tables...');
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('✅ Tables found:', tables.rows.map(r => r.table_name));
    
    // 2. Check User table
    console.log('\n👥 USER TABLE:');
    const userCount = await db.query('SELECT COUNT(*) as count FROM "User"');
    console.log(`   Total users: ${userCount.rows[0].count}`);
    
    if (userCount.rows[0].count > 0) {
      const users = await db.query('SELECT id, email, handle, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 5');
      console.log('   Recent users:');
      users.rows.forEach(user => {
        console.log(`   - ${user.email} (${user.handle || 'no handle'}) - ${user.createdAt}`);
      });
    }
    
    // 3. Check OTP table
    console.log('\n🔐 OTP TABLE:');
    const otpCount = await db.query('SELECT COUNT(*) as count FROM "OTP"');
    console.log(`   Total OTPs: ${otpCount.rows[0].count}`);
    
    if (otpCount.rows[0].count > 0) {
      const otps = await db.query('SELECT email, used, "createdAt", "expiresAt" FROM "OTP" ORDER BY "createdAt" DESC LIMIT 3');
      console.log('   Recent OTPs:');
      otps.rows.forEach(otp => {
        console.log(`   - ${otp.email} (used: ${otp.used}) - ${otp.createdAt}`);
      });
    }
    
    // 4. Check Twin table
    console.log('\n🤖 TWIN TABLE:');
    const twinCount = await db.query('SELECT COUNT(*) as count FROM "Twin"');
    console.log(`   Total twins: ${twinCount.rows[0].count}`);
    
    // 5. Check Chat table
    console.log('\n💬 CHAT TABLE:');
    const chatCount = await db.query('SELECT COUNT(*) as count FROM "Chat"');
    console.log(`   Total chats: ${chatCount.rows[0].count}`);
    
    // 6. Check Message table
    console.log('\n📝 MESSAGE TABLE:');
    const messageCount = await db.query('SELECT COUNT(*) as count FROM "Message"');
    console.log(`   Total messages: ${messageCount.rows[0].count}`);
    
    // 7. Check Event table
    console.log('\n📊 EVENT TABLE:');
    const eventCount = await db.query('SELECT COUNT(*) as count FROM "Event"');
    console.log(`   Total events: ${eventCount.rows[0].count}`);
    
    console.log('\n✅ Database test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

testDatabase();
