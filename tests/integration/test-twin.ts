import { db, userQueries, twinQueries } from './src/config/database';

async function testTwinCreation() {
  console.log('🤖 TESTING TWIN CREATION...\n');
  
  try {
    // Get user
    const user = await userQueries.findByEmail('testuser@example.com');
    console.log('👤 User found:', user.email);
    
    // Create twin
    const styleVector = {
      personality: 'friendly',
      tone: 'casual',
      topics: ['technology', 'music', 'travel']
    };
    const sampleReply = 'Hey! How are you doing today?';
    
    console.log('\n🤖 Creating AI Twin...');
    const twin = await twinQueries.create(user.id, styleVector, sampleReply);
    console.log('✅ Twin created:', twin);
    
    // Find twins for user
    console.log('\n🔍 Finding user twins...');
    const userTwins = await twinQueries.findByUserId(user.id);
    console.log('✅ User twins:', userTwins.length, 'found');
    
  } catch (error) {
    console.error('❌ Twin creation test failed:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

testTwinCreation();
