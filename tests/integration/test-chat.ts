import { db, userQueries, twinQueries, chatQueries, messageQueries } from './src/config/database';

async function testChatSystem() {
  console.log('💬 TESTING CHAT SYSTEM...\n');
  
  try {
    // Get user and twin
    const user = await userQueries.findByEmail('testuser@example.com');
    const twins = await twinQueries.findByUserId(user.id);
    const twin = twins[0];
    
    console.log('👤 User:', user.email);
    console.log('🤖 Twin:', twin.id);
    
    // Create chat
    console.log('\n💬 Creating chat...');
    const chat = await chatQueries.create(user.id, twin.id);
    console.log('✅ Chat created:', chat);
    
    // Create messages
    console.log('\n📝 Creating messages...');
    
    const humanMessage = await messageQueries.create(chat.id, 'human', 'Hello! How are you?', true);
    console.log('✅ Human message:', humanMessage.content);
    
    const twinMessage = await messageQueries.create(chat.id, 'twin', 'Hey! I\'m doing great, thanks for asking! How about you?', false);
    console.log('✅ Twin message:', twinMessage.content);
    
    // Get chat messages
    console.log('\n🔍 Getting chat messages...');
    const messages = await messageQueries.findByChatId(chat.id);
    console.log('✅ Messages in chat:', messages.length);
    messages.forEach((msg, index) => {
      console.log(`   ${index + 1}. [${msg.sender}] ${msg.content} (approved: ${msg.approved})`);
    });
    
  } catch (error) {
    console.error('❌ Chat system test failed:', error);
  } finally {
    await db.close();
    process.exit(0);
  }
}

testChatSystem();
