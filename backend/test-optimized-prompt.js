/**
 * Test Script: Optimized System Prompt với Groq API
 * 
 * Mục đích: Kiểm tra xem prompt đã tối ưu có hoạt động với Groq API
 * và có đủ token budget cho conversation không
 */

const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY 
});

// Load system prompts
const voicePrompt = fs.readFileSync(
  path.join(__dirname, '../ai-agent/prompts/system-prompt-voice.md'),
  'utf-8'
);

const textPrompt = fs.readFileSync(
  path.join(__dirname, '../ai-agent/prompts/system-prompt.md'),
  'utf-8'
);

// Test scenarios
const testScenarios = [
  {
    name: 'Khách hỏi giá',
    messages: [
      { role: 'user', content: 'Áo sơ mi này giá bao nhiêu?' }
    ],
    expectation: 'AI phải nói sẽ check inventory và nói giá tự nhiên'
  },
  {
    name: 'Khách nói đắt',
    messages: [
      { role: 'user', content: 'Áo sơ mi Oxford đẹp nhỉ' },
      { role: 'assistant', content: 'Dạ đúng rồi ạ! Áo này chất cotton oxford không nhăn lắm, mặc đi làm rất hợp. Giá khoảng 150k, tầm 5-6 đô USDC. Bạn mặc size bao nhiêu ạ?' },
      { role: 'user', content: 'Mắc quá!' }
    ],
    expectation: 'AI phải xác nhận cảm giác, reframe giá trị, offer alternative'
  },
  {
    name: 'Khách sẵn sàng mua',
    messages: [
      { role: 'user', content: 'Áo hoodie có size L màu đen không?' },
      { role: 'assistant', content: 'Dạ để mình check nhé... Có ạ, size L màu đen còn hàng!' },
      { role: 'user', content: 'Ừ được' }
    ],
    expectation: 'AI phải dùng assumptive close, hỏi tên/địa chỉ (không hỏi "có mua không?")'
  }
];

/**
 * Test một prompt với một scenario
 */
async function testPromptWithScenario(promptType, systemPrompt, scenario) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Test: ${promptType} - ${scenario.name}`);
  console.log(`${'='.repeat(60)}`);
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...scenario.messages
  ];
  
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile', // Model Groq phổ biến
      messages,
      max_tokens: 200,
      temperature: 0.7,
    });
    
    const aiResponse = response.choices[0].message.content;
    const usage = response.usage;
    
    console.log('\n📊 Token Usage:');
    console.log(`   Prompt tokens: ${usage.prompt_tokens}`);
    console.log(`   Completion tokens: ${usage.completion_tokens}`);
    console.log(`   Total tokens: ${usage.total_tokens}`);
    
    // Kiểm tra token budget
    const remainingBudget = 6000 - usage.total_tokens;
    const canContinue = remainingBudget > 1000; // Cần ít nhất 1000 token để tiếp tục
    
    console.log(`   Remaining budget: ${remainingBudget} tokens`);
    console.log(`   Can continue conversation: ${canContinue ? '✅' : '❌'}`);
    
    console.log('\n💬 AI Response:');
    console.log(`   ${aiResponse}`);
    
    console.log('\n🎯 Expected Behavior:');
    console.log(`   ${scenario.expectation}`);
    
    // Check response length for voice
    if (promptType === 'Voice Prompt') {
      const sentences = aiResponse.split(/[.!?]+/).filter(s => s.trim().length > 0);
      console.log(`\n📏 Voice Check:`);
      console.log(`   Number of sentences: ${sentences.length} ${sentences.length <= 3 ? '✅' : '❌ (should be ≤3)'}`);
      
      const avgWordsPerSentence = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
      console.log(`   Avg words/sentence: ${avgWordsPerSentence.toFixed(1)} ${avgWordsPerSentence <= 20 ? '✅' : '❌ (should be ≤20)'}`);
    }
    
    return {
      success: true,
      usage,
      canContinue,
      response: aiResponse
    };
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('context_length_exceeded')) {
      console.error('   → System prompt quá dài! Cần tối ưu thêm.');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test full conversation flow
 */
async function testFullConversation() {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 Test: Full Conversation Flow (10 turns)');
  console.log('='.repeat(60));
  
  const messages = [
    { role: 'system', content: voicePrompt }
  ];
  
  const conversationFlow = [
    'Chào shop',
    'Có áo nào mặc đi làm không?',
    'Smart casual',
    'Mắc quá!',
    'Ừ cũng được, size L có không?',
    'Được, đặt luôn',
    'Tên mình là Nguyễn Văn A',
    'Địa chỉ 123 Nguyễn Huệ, Q1, HCM',
    'Ok mình quét QR rồi',
    'Dễ lắm, mình thấy ổn'
  ];
  
  try {
    for (let i = 0; i < conversationFlow.length; i++) {
      const userMessage = conversationFlow[i];
      messages.push({ role: 'user', content: userMessage });
      
      console.log(`\nTurn ${i + 1}:`);
      console.log(`User: ${userMessage}`);
      
      const response = await groq.chat.completions.create({
        model: 'llama-3.1-70b-versatile',
        messages,
        max_tokens: 150,
        temperature: 0.7,
      });
      
      const aiResponse = response.choices[0].message.content;
      messages.push({ role: 'assistant', content: aiResponse });
      
      console.log(`AI: ${aiResponse}`);
      console.log(`Tokens: ${response.usage.total_tokens}/6000`);
      
      // Nếu vượt 5500 tokens, cảnh báo
      if (response.usage.total_tokens > 5500) {
        console.log('⚠️  Warning: Approaching token limit!');
      }
      
      // Delay để tránh rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✅ Full conversation completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Conversation failed:', error.message);
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n🚀 Starting Optimized Prompt Tests...\n');
  
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ Error: GROQ_API_KEY not found in .env file');
    console.log('   Please add: GROQ_API_KEY=your_key_here');
    process.exit(1);
  }
  
  const results = {
    voice: [],
    text: [],
  };
  
  // Test Voice Prompt
  console.log('\n📢 Testing VOICE PROMPT (system-prompt-voice.md)');
  for (const scenario of testScenarios) {
    const result = await testPromptWithScenario('Voice Prompt', voicePrompt, scenario);
    results.voice.push({ scenario: scenario.name, ...result });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit delay
  }
  
  // Test Text Prompt
  console.log('\n\n💬 Testing TEXT PROMPT (system-prompt.md)');
  for (const scenario of testScenarios) {
    const result = await testPromptWithScenario('Text Prompt', textPrompt, scenario);
    results.text.push({ scenario: scenario.name, ...result });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Test full conversation
  await testFullConversation();
  
  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const voiceSuccess = results.voice.filter(r => r.success).length;
  const textSuccess = results.text.filter(r => r.success).length;
  
  console.log(`\nVoice Prompt: ${voiceSuccess}/${testScenarios.length} passed`);
  console.log(`Text Prompt: ${textSuccess}/${testScenarios.length} passed`);
  
  const avgTokensVoice = results.voice
    .filter(r => r.usage)
    .reduce((sum, r) => sum + r.usage.total_tokens, 0) / voiceSuccess;
  
  const avgTokensText = results.text
    .filter(r => r.usage)
    .reduce((sum, r) => sum + r.usage.total_tokens, 0) / textSuccess;
  
  console.log(`\nAverage tokens (Voice): ${avgTokensVoice.toFixed(0)}`);
  console.log(`Average tokens (Text): ${avgTokensText.toFixed(0)}`);
  
  const allPassed = voiceSuccess === testScenarios.length && 
                    textSuccess === testScenarios.length;
  
  if (allPassed) {
    console.log('\n✅ All tests PASSED! Prompts are ready for production.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review and adjust prompts.');
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run tests
runAllTests().catch(console.error);
