import { db, userQueries } from './src/config/database';

async function createTestUser() {
  console.log('🧪 Creating test user...');
  
  try {
    const user = await userQueries.create('testuser@example.com', 'testuser');
    console.log('✅ User created:', user);
    
    // Check if user exists
    const foundUser = await userQueries.findByEmail('testuser@example.com');
    console.log('✅ User found:', foundUser);
    
  } catch (error) {
    console.error('❌ Error creating user:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

createTestUser();
