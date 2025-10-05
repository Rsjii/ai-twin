// Simple test to verify signup flow
const testEmail = `test${Date.now()}@example.com`;
const testPassword = 'testpassword123';

console.log('🧪 Testing Signup Flow');
console.log('📧 Test Email:', testEmail);

async function testSignup() {
    try {
        // First, get CSRF token by visiting auth page
        const authResponse = await fetch('http://localhost:3000/auth');
        const authHtml = await authResponse.text();
        
        // Extract CSRF token from HTML
        const csrfMatch = authHtml.match(/name="_csrf" value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : 'test-token';
        
        console.log('🔐 CSRF Token:', csrfToken);
        
        // Now test signup
        const response = await fetch('http://localhost:3000/api/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                email: testEmail,
                password: testPassword
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Signup successful!');
            console.log('📧 OTP sent to:', testEmail);
            console.log('🔑 OTP Code:', result.otp || 'Check server logs');
            console.log('📱 Redirect URL:', `/verify-otp?email=${encodeURIComponent(testEmail)}&type=signup`);
            return true;
        } else {
            console.log('❌ Signup failed:', result.error);
            return false;
        }
    } catch (error) {
        console.log('❌ Signup error:', error.message);
        return false;
    }
}

testSignup();
