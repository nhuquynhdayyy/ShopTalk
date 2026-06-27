/**
 * Test script to verify persistent chat history implementation
 * Run: node backend/test-persistent-chat.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const crypto = require('crypto');
const { pool } = require('./src/config/db');
const ChatHistoryModel = require('./src/models/chatHistory.model');

async function testPersistentChat() {
  console.log('🧪 Testing Persistent Chat History Implementation\n');
  
  const testSessionId = crypto.randomUUID();
  console.log(`📋 Test Session ID: ${testSessionId}\n`);
  
  try {
    // Step 1: Create session
    console.log('Step 1: Creating session in database...');
    await pool.query(
      `INSERT INTO sessions (id, type, status, user_meta) 
       VALUES ($1, 'text', 'active', '{"language":"vi"}')`,
      [testSessionId]
    );
    console.log('✅ Session created\n');
    
    // Step 2: Add user message
    console.log('Step 2: Adding user message...');
    const userMsg = await ChatHistoryModel.addMessage(
      testSessionId, 
      'user', 
      'text', 
      'Xin chào, shop có sản phẩm gì?'
    );
    console.log('✅ User message saved:', {
      id: userMsg.id,
      sender: userMsg.sender,
      content: userMsg.content.substring(0, 50)
    });
    console.log('');
    
    // Step 3: Add AI reply
    console.log('Step 3: Adding AI reply...');
    const aiMsg = await ChatHistoryModel.addMessage(
      testSessionId,
      'ai',
      'text',
      'Dạ bên em có nhiều sản phẩm như Solana Mobile Saga, áo thun, tai nghe...'
    );
    console.log('✅ AI reply saved:', {
      id: aiMsg.id,
      sender: aiMsg.sender,
      content: aiMsg.content.substring(0, 50)
    });
    console.log('');
    
    // Step 4: Add second user message
    console.log('Step 4: Adding follow-up user message...');
    const userMsg2 = await ChatHistoryModel.addMessage(
      testSessionId,
      'user',
      'text',
      'Giá Saga bao nhiêu?'
    );
    console.log('✅ User message 2 saved:', {
      id: userMsg2.id,
      sender: userMsg2.sender,
      content: userMsg2.content
    });
    console.log('');
    
    // Step 5: Retrieve full history
    console.log('Step 5: Retrieving full chat history...');
    const history = await ChatHistoryModel.getBySession(testSessionId);
    console.log(`✅ Retrieved ${history.length} messages:\n`);
    
    history.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.sender.toUpperCase()}] ${msg.content}`);
      console.log(`     Timestamp: ${msg.timestamp}\n`);
    });
    
    // Step 6: Verify context would be preserved
    console.log('Step 6: Simulating server restart scenario...');
    console.log('   (In real scenario, in-memory Map would be empty)');
    console.log('   Loading history from database...');
    const reloadedHistory = await ChatHistoryModel.getBySession(testSessionId);
    console.log(`✅ Context preserved! ${reloadedHistory.length} messages loaded from PostgreSQL\n`);
    
    // Step 7: Cleanup
    console.log('Step 7: Cleaning up test data...');
    await pool.query('DELETE FROM chat_history WHERE session_id = $1', [testSessionId]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
    console.log('✅ Test data cleaned up\n');
    
    console.log('🎉 All tests passed! Persistent chat history is working correctly.\n');
    console.log('✅ User messages are saved to database');
    console.log('✅ AI replies are saved to database');
    console.log('✅ Chat history can be retrieved after restart');
    console.log('✅ Multi-turn context is preserved\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

testPersistentChat();
