/**
 * Test script: Log Feedback và Get Reviews
 */

const db = require('./src/config/db');
const logFeedbackTool = require('../ai-agent/tools/logFeedback.tool');
const getReviewsTool = require('../ai-agent/tools/getReviews.tool');
const { v4: uuidv4 } = require('uuid');

async function testFeedbackAndReviews() {
  console.log('🧪 Bắt đầu test Log Feedback và Get Reviews...\n');

  try {
    // ─── Test 1: Tạo session test ──────────────────────────────────────────
    console.log('📋 Test 1: Tạo session test...');
    const testSessionId = uuidv4();
    await db.pool.query(`
      INSERT INTO sessions (id, type, status)
      VALUES ($1, 'text', 'active')
    `, [testSessionId]);
    console.log(`✅ Session created: ${testSessionId}\n`);

    // ─── Test 2: Log Feedback (Positive) ───────────────────────────────────
    console.log('📝 Test 2: Log feedback positive...');
    const feedback1Result = await logFeedbackTool.handler(
      {
        session_id: testSessionId,
        feedback_type: 'positive',
        content: 'Áo thun rất đẹp và chất lượng, mình rất hài lòng!',
        product_sku: 'AT-001',
        rating: 5
      },
      { db: db.pool, logger: console }
    );
    console.log('Result:', feedback1Result);
    console.log();

    // ─── Test 3: Log Feedback (Complaint) ──────────────────────────────────
    console.log('📝 Test 3: Log feedback complaint...');
    const feedback2Result = await logFeedbackTool.handler(
      {
        session_id: testSessionId,
        feedback_type: 'complaint',
        content: 'Giao hàng hơi chậm so với dự kiến.',
        rating: 3
      },
      { db: db.pool, logger: console }
    );
    console.log('Result:', feedback2Result);
    console.log();

    // ─── Test 4: Log Feedback (Suggestion) ─────────────────────────────────
    console.log('📝 Test 4: Log feedback suggestion...');
    const feedback3Result = await logFeedbackTool.handler(
      {
        session_id: testSessionId,
        feedback_type: 'suggestion',
        content: 'Nên có thêm size XXL cho người to con.',
        product_sku: 'AT-002'
      },
      { db: db.pool, logger: console }
    );
    console.log('Result:', feedback3Result);
    console.log();

    // ─── Test 5: Đọc lại feedbacks từ database ─────────────────────────────
    console.log('📖 Test 5: Đọc lại feedbacks từ chat_history...');
    const readResult = await db.pool.query(`
      SELECT id, sender, type, content, timestamp
      FROM chat_history
      WHERE session_id = $1
      ORDER BY timestamp ASC
    `, [testSessionId]);

    console.log(`✅ Tìm thấy ${readResult.rows.length} feedbacks:`);
    readResult.rows.forEach((row, idx) => {
      const parsed = JSON.parse(row.content);
      console.log(`\n  ${idx + 1}. [${row.timestamp.toISOString()}]`);
      console.log(`     Type: ${parsed.type}`);
      console.log(`     Feedback: ${parsed.meta.feedback_type}`);
      console.log(`     Content: ${parsed.text}`);
      if (parsed.meta.rating) {
        console.log(`     Rating: ${'⭐'.repeat(parsed.meta.rating)}`);
      }
      if (parsed.meta.product_sku) {
        console.log(`     Product: ${parsed.meta.product_sku}`);
      }
    });
    console.log();

    // ─── Test 6: Get Reviews từ database ───────────────────────────────────
    console.log('⭐ Test 6: Get reviews cho sản phẩm AT-001...');
    const reviewsResult = await getReviewsTool.handler(
      {
        product_sku: 'AT-001',
        limit: 3,
        min_rating: 1
      },
      { db: db.pool, logger: console }
    );
    console.log('Result:', JSON.stringify(reviewsResult, null, 2));
    console.log();

    // ─── Test 7: Get Reviews cho sản phẩm không có review ──────────────────
    console.log('⭐ Test 7: Get reviews cho sản phẩm không tồn tại...');
    const reviewsResult2 = await getReviewsTool.handler(
      {
        product_sku: 'NONEXIST',
        limit: 3
      },
      { db: db.pool, logger: console }
    );
    console.log('Result:', JSON.stringify(reviewsResult2, null, 2));
    console.log();

    // ─── Cleanup: Xóa session test ─────────────────────────────────────────
    console.log('🗑️  Cleanup: Xóa session test...');
    await db.pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
    console.log('✅ Session test đã được xóa.');

    console.log('\n🎉 Tất cả test đã hoàn thành!');

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error(error.stack);
  } finally {
    await db.pool.end();
    console.log('\n🔌 Đã đóng kết nối database.');
  }
}

testFeedbackAndReviews();
