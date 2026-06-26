const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });
process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';

const { chat, sessionLanguages, getSessionHistory } = require('./src/services/ai.service');
const SessionModel = require('./src/models/session.model');
const db = require('./src/config/db');

async function run() {
  console.log('=== SIMULATING USER OBJECTION AND FEEDBACK (MULTI-TURN) ===\n');

  // 1. Tạo session hợp lệ trong database để log_feedback không bị lỗi UUID / Session NOT found
  console.log('Creating a valid database session...');
  const session = await SessionModel.create('text', { test_agent: 'Antigravity' });
  const sessionId = session.id;
  console.log(`Successfully created DB session: ${sessionId}\n`);

  sessionLanguages.set(sessionId, 'vi');

  // Turn 1
  console.log('Turn 1: Customer asks about Áo thun Oversize Trendy');
  let res1 = await chat(sessionId, "Shop tư vấn giúp mình mẫu Áo thun Oversize Trendy với", "vi");
  console.log('AI Reply 1:', res1.reply);
  console.log('--------------------------------------------------\n');

  // Delay 5s để tránh Rate Limit trên Groq
  console.log('Waiting 6 seconds to avoid rate limiting...');
  await new Promise(resolve => setTimeout(resolve, 6000));

  // Turn 2
  console.log('Turn 2: Customer says "Giá hơi cao nhưng mẫu mã đẹp"');
  let res2 = await chat(sessionId, "Giá hơi cao nhưng mẫu mã đẹp", "vi");
  console.log('AI Reply 2:', res2.reply);
  console.log('--------------------------------------------------\n');

  console.log('Final Session History:');
  const history = getSessionHistory(sessionId);
  console.log(JSON.stringify(history, null, 2));

  // Kiểm tra xem các công cụ có được gọi chính xác không
  const toolCalls = history
    .filter(m => m.role === 'assistant' && m.tool_calls)
    .flatMap(m => m.tool_calls.map(tc => tc.function.name));
  
  console.log('\n=== VERIFICATION RESULTS ===');
  console.log('Executed Tool Calls:', toolCalls);

  const hasLogFeedback = toolCalls.includes('log_feedback');
  const hasGetReviews = toolCalls.includes('get_reviews');

  if (hasLogFeedback && hasGetReviews) {
    console.log('✅ PASS: Cả get_reviews và log_feedback đều được AI gọi thành công!');
  } else {
    if (!hasLogFeedback) console.log('❌ FAIL: Không tìm thấy cuộc gọi log_feedback.');
    if (!hasGetReviews) console.log('❌ FAIL: Không tìm thấy cuộc gọi get_reviews.');
  }

  // Đóng database pool để dọn dẹp các kết nối đang mở
  await db.pool.end();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('Error running test:', err);
  try {
    await db.pool.end();
  } catch (_) {}
  process.exit(1);
});
