import { db, userQueries, otpQueries } from './src/config/database';
import { generateOTP, hashOTP, verifyOTP } from './src/modules/auth/authService';

async function testCompleteLoginFlow() {
  console.log('🔐 TESTING COMPLETE LOGIN FLOW...\n');
  
  try {
    const testEmail = 'newuser@example.com';
    
    // Step 1: Create user (simulate registration)
    console.log('1️⃣ Creating user...');
    let user = await userQueries.findByEmail(testEmail);
    if (!user) {
      user = await userQueries.create(testEmail, 'newuser');
      console.log('✅ User created:', user.email);
    } else {
      console.log('✅ User already exists:', user.email);
    }
    
    // Step 2: Generate OTP (simulate login start)
    console.log('\n2️⃣ Generating OTP...');
    const otp = generateOTP(6);
    const hashedOTP = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    const otpRecord = await otpQueries.create(testEmail, hashedOTP, expiresAt);
    console.log('✅ OTP created:', otpRecord.id);
    console.log('🔑 Generated OTP:', otp); // In real app, this would be sent via email
    
    // Step 3: Verify OTP (simulate login verify)
    console.log('\n3️⃣ Verifying OTP...');
    const foundOTP = await otpQueries.findByEmail(testEmail);
    
    if (!foundOTP) {
      throw new Error('OTP not found');
    }
    
    const isValid = await verifyOTP(otp, foundOTP.codeHash);
    if (!isValid) {
      throw new Error('Invalid OTP');
    }
    
    console.log('✅ OTP verified successfully');
    
    // Step 4: Mark OTP as used
    console.log('\n4️⃣ Marking OTP as used...');
    await otpQueries.markAsUsed(foundOTP.id);
    console.log('✅ OTP marked as used');
    
    // Step 5: Create session (simulate successful login)
    console.log('\n5️⃣ Login successful!');
    console.log('✅ User logged in:', user.email);
    console.log('✅ Session would be created with user ID:', user.id);
    
    console.log('\n🎉 COMPLETE LOGIN FLOW TEST PASSED!');
    
  } catch (error) {
    console.error('❌ Login flow test failed:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

testCompleteLoginFlow();
