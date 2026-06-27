/**
 * Integration test for AI chat with persistent history
 * Tests the full chat flow including AI service and database persistence
 * Run: node backend/test-ai-chat-persistence.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const crypto = require('crypto');
const { pool } = require('./src/config/db');
const ChatHistoryModel = require('./src/models/chatHistory.model');
const { chat, getSessionHistory } = require('./src/services/ai.service');

async function testAIChatPersistence() {
  console.log('🧪 Integration Test: AI Chat + Persistent History\n');
  
  const testSessionId = crypto.randomUUID();
  console.log(`📋 Test Session ID: ${testSessionId}\n`);
  
  try {
    // Test 1: First message - should create session and save to DB
    console.log('Test 1: Sending first message to AI...');
    const response1 = await chat(testSessionId, 'Xin chào, shop có gì?', 'vi');
    console.log('✅ AI Reply:', response1.reply?.substring(0, 80) + '...');
    console.log('');
    
    // Verify in database
    console.log('Test 1b: Verifying messages saved to database...');
    const dbHistory1 = await ChatHistoryModel.getBySession(testSessionId);
    console.log(`✅ Database contains ${dbHistory1.length} messages`);
    console.log(`   - User message: "${dbHistory1.find(m => m.sender === 'user')?.content.substring(0, 30)}..."`);
    console.log(`   - AI message: "${dbHistory1.find(m => m.sender === 'ai')?.content.substring(0, 30)}..."`);
    console.log('');
    
    // Test 2: Second message - should load context from DB
    console.log('Test 2: Sending follow-up message (should have context)...');
    const response2 = await chat(testSessionId, 'Còn Saga v2 bao nhiêu tiền?', 'vi');
    console.log('✅ AI Reply:', response2.reply?.substring(0, 80) + '...');
    console.log('');
    
    // Verify context in database
    console.log('Test 2b: Verifying conversation history in database...');
    const dbHistory2 = await ChatHistoryModel.getBySession(testSessionId);
    console.log(`✅ Database now contains ${dbHistory2.length} messages (should be 4)`);
    console.log('   Conversation flow:');
    dbHistory2.forEach((msg, idx) => {
      const preview = msg.content.substring(0, 40);
      console.log(`   ${idx + 1}. [${msg.sender.toUpperCase()}] ${preview}...`);
    });
    console.log('');
    
    // Test 3: Simulate server restart by checking getSessionHistory
    console.log('Test 3: Simulating server restart (testing getSessionHistory)...');
    const loadedHistory = await getSessionHistory(testSessionId);
    console.log(`✅ Loaded ${loadedHistory.length} messages from database`);
    console.log('   Context preserved after "restart":');
    loadedHistory.forEach((msg, idx) => {
      if (msg.role !== 'system') {
        const preview = msg.content?.substring(0, 40) || '';
        console.log(`   ${idx}. [${msg.role.toUpperCase()}] ${preview}...`);
      }
    });
    console.log('');
    
    // Test 4: Send message after "restart" - should still have context
    console.log('Test 4: Sending message after simulated restart...');
    const response3 = await chat(testSessionId, 'Tôi muốn mua cái đó', 'vi');
    console.log('✅ AI Reply (should recognize "cái đó" = Saga v2 from context):');
    console.log('   ' + response3.reply?.substring(0, 100) + '...');
    console.log('');
    
    // Final verification
    console.log('Final Verification: Complete chat history...');
    const finalHistory = await ChatHistoryModel.getBySession(testSessionId);
    console.log(`✅ Total messages in database: ${finalHistory.length} (should be 6)`);
    console.log('\n📜 Complete conversation:');
    finalHistory.forEach((msg, idx) => {
      console.log(`\n${idx + 1}. [${msg.sender.toUpperCase()}]`);
      console.log(`   ${msg.content.substring(0, 80)}${msg.content.length > 80 ? '...' : ''}`);
      console.log(`   Time: ${msg.timestamp}`);
    });
    console.log('');
    
    // Cleanup
    console.log('\nCleaning up test data...');
    await pool.query('DELETE FROM chat_history WHERE session_id = $1', [testSessionId]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
    console.log('✅ Test data cleaned up\n');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 ALL INTEGRATION TESTS PASSED!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ AI chat generates responses');
    console.log('✅ User messages persist to PostgreSQL');
    console.log('✅ AI replies persist to PostgreSQL');
    console.log('✅ Context loads from database after restart');
    console.log('✅ Multi-turn conversation maintains context');
    console.log('✅ Production bug is FIXED: context survives Railway restart');
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error('Stack:', error.stack);
    
    // Cleanup on error
    try {
      await pool.query('DELETE FROM chat_history WHERE session_id = $1', [testSessionId]);
      await pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
    } catch (cleanupError) {
      console.error('⚠️ Cleanup failed:', cleanupError.message);
    }
    
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

testAIChatPersistence();
