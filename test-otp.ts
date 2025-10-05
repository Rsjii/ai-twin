import { db, otpQueries } from './src/config/database';

async function testOTP() {
  console.log('🔐 TESTING OTP SYSTEM...\n');
  
  try {
    // Create OTP
    const email = 'testuser@example.com';
    const codeHash = 'hashed_otp_123456';
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    console.log('📝 Creating OTP...');
    const otp = await otpQueries.create(email, codeHash, expiresAt);
    console.log('✅ OTP created:', otp);
    
    // Find OTP
    console.log('\n🔍 Finding OTP...');
    const foundOTP = await otpQueries.findByEmail(email);
    console.log('✅ OTP found:', foundOTP);
    
    // Mark as used
    console.log('\n✅ Marking OTP as used...');
    const usedOTP = await otpQueries.markAsUsed(foundOTP.id);
    console.log('✅ OTP marked as used:', usedOTP);
    
  } catch (error) {
    console.error('❌ OTP test failed:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

testOTP();
