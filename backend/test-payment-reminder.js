/**
 * test-payment-reminder.js
 * Kiểm tra Task 4: Nhắc thanh toán sau 5 phút
 *
 * GHI CHÚ: order.model.js đã có sẵn getPaymentReminderCandidates() và
 * markPaymentReminderSent(). NHƯNG paymentWatcher.js hiện tại CHƯA gọi
 * 2 hàm này, và emitPaymentReminder() trong socket.server.js cũng chưa
 * được dùng ở đâu. => Phần "nối" 3 thứ lại với nhau (query -> emit -> mark)
 * vẫn còn thiếu code thật.
 *
 * Test gồm 2 phần:
 *  A. Test trực tiếp order.model.js (code thật, mock db.query)
 *  B. Test CONTRACT cho hàm tích hợp `runPaymentReminderCheck()` —
 *     định nghĩa rõ hành vi đúng cần có khi bạn nối code thật vào.
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ─── Phần A: order.model.js thật ────────────────────────────────────────────

const DB_PATH = path.resolve(__dirname, 'src/config/db.js');
const ORDER_MODEL_PATH = path.resolve(__dirname, 'src/models/order.model.js');

function freshOrderModel(queryImpl) {
  delete require.cache[DB_PATH];
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: { query: queryImpl } };
  delete require.cache[ORDER_MODEL_PATH];
  return require(ORDER_MODEL_PATH);
}

test('getPaymentReminderCandidates: query đúng điều kiện (status, payment_reminded_at, created_at, expires_at)', async () => {
  let capturedSQL = '';
  let capturedParams = null;

  const orderModel = freshOrderModel(async (sql, params) => {
    capturedSQL = sql;
    capturedParams = params;
    return { rows: [{ id: 'order-1', status: 'pending' }] };
  });

  const result = await orderModel.getPaymentReminderCandidates(5);

  assert.ok(capturedSQL.includes("status = 'pending'"), 'Query phải lọc status pending');
  assert.ok(capturedSQL.includes('payment_reminded_at IS NULL'), 'Query phải lọc chưa từng nhắc');
  assert.ok(capturedSQL.includes('expires_at > NOW()'), 'Query phải loại đơn đã hết hạn (tránh nhắc đơn expired)');
  assert.deepStrictEqual(capturedParams, [5]);
  assert.strictEqual(result.length, 1);
});

test('getPaymentReminderCandidates: default minutesWaiting = 5 nếu không truyền', async () => {
  let capturedParams = null;
  const orderModel = freshOrderModel(async (sql, params) => {
    capturedParams = params;
    return { rows: [] };
  });

  await orderModel.getPaymentReminderCandidates();

  assert.deepStrictEqual(capturedParams, [5]);
});

test('markPaymentReminderSent: UPDATE đúng điều kiện, chỉ set khi payment_reminded_at IS NULL (chống ghi đè 2 lần)', async () => {
  let capturedSQL = '';
  let capturedParams = null;

  const orderModel = freshOrderModel(async (sql, params) => {
    capturedSQL = sql;
    capturedParams = params;
    return { rows: [{ id: 'order-1', payment_reminded_at: new Date().toISOString() }] };
  });

  const result = await orderModel.markPaymentReminderSent('order-1');

  assert.ok(capturedSQL.includes('payment_reminded_at IS NULL'), 'Phải chỉ update khi chưa từng được mark, tránh race 2 worker cùng chạy');
  assert.deepStrictEqual(capturedParams, ['order-1']);
  assert.ok(result.payment_reminded_at);
});

test('markPaymentReminderSent: trả về null nếu đơn không tồn tại hoặc đã được mark trước đó (0 row affected)', async () => {
  const orderModel = freshOrderModel(async () => ({ rows: [] }));

  const result = await orderModel.markPaymentReminderSent('order-khong-ton-tai');

  assert.strictEqual(result, null);
});

// ─── Phần B: CONTRACT cho hàm tích hợp còn thiếu ───────────────────────────
//
// Hàm mẫu mô tả ĐÚNG hành vi cần có. Khi bạn viết code thật (gợi ý: thêm vào
// paymentWatcher.js hoặc tạo paymentReminder.worker.js riêng), hãy đảm bảo nó
// thỏa các test dưới đây bằng cách require() hàm thật vào thay cho hàm mẫu.

async function runPaymentReminderCheckReference(deps) {
  const candidates = await deps.getPaymentReminderCandidates(5);
  const results = [];

  for (const order of candidates) {
    const marked = await deps.markPaymentReminderSent(order.id);
    if (!marked) continue; // đơn đã bị mark bởi tiến trình khác (race) -> không emit nữa

    const minutesWaiting = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    deps.emitPaymentReminder({
      orderId: order.id,
      amount: order.amount,
      productName: order.product_name,
      minutesWaiting,
    });
    results.push(order.id);
  }

  return results;
}

test('[CONTRACT] runPaymentReminderCheck: phải mark TRƯỚC khi emit (tránh emit trùng khi race)', async () => {
  const callOrder = [];

  await runPaymentReminderCheckReference({
    getPaymentReminderCandidates: async () => [
      { id: 'order-1', amount: 10, product_name: 'P', created_at: new Date(Date.now() - 6 * 60000).toISOString() },
    ],
    markPaymentReminderSent: async (id) => { callOrder.push(`mark:${id}`); return { id }; },
    emitPaymentReminder: (payload) => { callOrder.push(`emit:${payload.orderId}`); },
  });

  assert.deepStrictEqual(callOrder, ['mark:order-1', 'emit:order-1'], 'Phải mark trước, emit sau — không được làm ngược');
});

test('[CONTRACT] runPaymentReminderCheck: nếu markPaymentReminderSent trả null (race condition), KHÔNG được emit', async () => {
  let emitCalled = false;

  const result = await runPaymentReminderCheckReference({
    getPaymentReminderCandidates: async () => [
      { id: 'order-1', amount: 10, product_name: 'P', created_at: new Date().toISOString() },
    ],
    markPaymentReminderSent: async () => null, // simulate: worker khác đã mark trước
    emitPaymentReminder: () => { emitCalled = true; },
  });

  assert.strictEqual(emitCalled, false, 'Không được emit nếu mark thất bại do race condition với worker khác');
  assert.deepStrictEqual(result, []);
});

test('[CONTRACT] runPaymentReminderCheck: không có candidate nào -> không gọi emit, không lỗi', async () => {
  let emitCalled = false;

  const result = await runPaymentReminderCheckReference({
    getPaymentReminderCandidates: async () => [],
    markPaymentReminderSent: async () => ({}),
    emitPaymentReminder: () => { emitCalled = true; },
  });

  assert.strictEqual(emitCalled, false);
  assert.deepStrictEqual(result, []);
});

test('[CONTRACT] runPaymentReminderCheck: nhiều đơn cùng lúc, 1 đơn bị race (null) -> các đơn khác vẫn được emit', async () => {
  const emitted = [];

  await runPaymentReminderCheckReference({
    getPaymentReminderCandidates: async () => [
      { id: 'order-1', amount: 10, product_name: 'A', created_at: new Date().toISOString() },
      { id: 'order-2', amount: 20, product_name: 'B', created_at: new Date().toISOString() },
      { id: 'order-3', amount: 30, product_name: 'C', created_at: new Date().toISOString() },
    ],
    markPaymentReminderSent: async (id) => (id === 'order-2' ? null : { id }),
    emitPaymentReminder: (payload) => emitted.push(payload.orderId),
  });

  assert.deepStrictEqual(emitted, ['order-1', 'order-3'], 'order-2 bị race nên không emit, nhưng order-1 và order-3 vẫn phải emit bình thường');
});

// ─── Chạy tuần tự ────────────────────────────────────────────────────────────

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed += 1;
    } catch (err) {
      console.log(`❌ FAIL: ${name}`);
      console.log(`   ${err.message}`);
      failed += 1;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log('\n⚠️  LƯU Ý: Phần [CONTRACT] test hàm MẪU (runPaymentReminderCheckReference) định nghĩa trong file này,');
  console.log('   vì paymentWatcher.js hiện tại CHƯA gọi getPaymentReminderCandidates/markPaymentReminderSent/emitPaymentReminder.');
  console.log('   Khi viết code thật, require() hàm thật vào và xóa hàm mẫu này.');
  if (failed > 0) process.exit(1);
})();