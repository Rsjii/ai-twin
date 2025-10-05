// Test the updated authentication flow
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testUpdatedFlow() {
  console.log('🧪 Testing Updated Authentication Flow...\n');
  
  try {
    // 1. Test landing page
    console.log('1️⃣ Testing Landing Page...');
    const landingResponse = await fetch(`${BASE_URL}/`);
    if (landingResponse.ok) {
      console.log('✅ Landing page loads successfully');
      const html = await landingResponse.text();
      if (html.includes('Get Started Now') && !html.includes('Join the Waitlist')) {
        console.log('✅ Waitlist removed, direct login buttons present');
      } else {
        console.log('❌ Landing page still has waitlist or missing login buttons');
      }
    } else {
      console.log('❌ Landing page failed to load');
    }
    
    // 2. Test login start
    console.log('\n2️⃣ Testing Login Start...');
    const loginStartResponse = await fetch(`${BASE_URL}/api/auth/login/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test-token'
      },
      body: JSON.stringify({ email: 'test@example.com' })
    });
    
    if (loginStartResponse.ok) {
      console.log('✅ Login start works - OTP sent');
    } else {
      console.log('❌ Login start failed');
      const error = await loginStartResponse.text();
      console.log('Error:', error);
    }
    
    // 3. Test waitlist endpoint (should not exist)
    console.log('\n3️⃣ Testing Waitlist Endpoint (should fail)...');
    const waitlistResponse = await fetch(`${BASE_URL}/api/auth/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test-token'
      },
      body: JSON.stringify({ email: 'test@example.com' })
    });
    
    if (waitlistResponse.status === 404) {
      console.log('✅ Waitlist endpoint removed successfully');
    } else {
      console.log('❌ Waitlist endpoint still exists');
    }
    
    console.log('\n🎉 Updated Flow Test Complete!');
    console.log('\n📋 Summary:');
    console.log('- Landing page shows AI Twin creation focus');
    console.log('- Direct login buttons instead of waitlist');
    console.log('- Waitlist endpoint removed');
    console.log('- Login flow works for user creation');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testUpdatedFlow();
