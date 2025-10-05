import { db } from './src/config/database';

async function quickCheck() {
  console.log('🔍 QUICK DATABASE CHECK...\n');
  
  try {
    // Check Users
    console.log('👥 USERS:');
    const users = await db.query('SELECT id, email, handle, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 5');
    console.log(`   Total users: ${users.rows.length}`);
    users.rows.forEach(user => {
      console.log(`   ✅ ${user.email} (${user.handle || 'no handle'}) - ${user.createdAt}`);
    });
    
    // Check OTPs
    console.log('\n🔐 OTPs:');
    const otps = await db.query('SELECT email, used, "createdAt" FROM "OTP" ORDER BY "createdAt" DESC LIMIT 3');
    console.log(`   Total OTPs: ${otps.rows.length}`);
    otps.rows.forEach(otp => {
      console.log(`   ${otp.used ? '✅' : '⏳'} ${otp.email} (used: ${otp.used}) - ${otp.createdAt}`);
    });
    
    console.log('\n✅ Quick check completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

quickCheck();
