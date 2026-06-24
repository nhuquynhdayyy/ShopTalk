/**
 * test-order-idempotency.js
 * Kiểm tra Task 6: Idempotency của order.model.js — updateOrderStatus()
 *
 * Đây là phần quan trọng nhất chống lỗi tiền: 1 tx_signature không được
 * gán cho 2 đơn hàng khác nhau, và 1 đơn đã "paid" không được phép bị
 * update lại (tránh watcher chạy lại poll cũ ghi đè trạng thái).
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const DB_PATH = path.resolve(__dirname, 'src/config/db.js');
const SOCKET_PATH = path.resolve(__dirname, 'src/websocket/socket.server.js');
const ORDER_MODEL_PATH = path.resolve(__dirname, 'src/models/order.model.js');

function freshOrderModel({ queryImpl, existingTxOrder = null }) {
  delete require.cache[DB_PATH];
  delete require.cache[SOCKET_PATH];
  delete require.cache[ORDER_MODEL_PATH];

  // Mock db.query: con trỏ tới queryImpl do test cung cấp
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: { query: queryImpl } };

  // updateOrderStatus có require('../websocket/socket.server') lồng bên trong (lazy require)
  // -> mock luôn để tránh side-effect/log thật, không ảnh hưởng logic idempotency
  require.cache[SOCKET_PATH] = { id: SOCKET_PATH, filename: SOCKET_PATH, loaded: true, exports: { getIo: () => null } };

  return require(ORDER_MODEL_PATH);
}

// ─── Test 1: Đơn đã "paid" -> KHÔNG được update lại (status <> 'paid' guard) ──

test('updateOrderStatus: đơn đã "paid" rồi -> query WHERE phải loại trừ status=paid, trả null', async () => {
  const orderModel = freshOrderModel({
    // Giả lập DB: WHERE status <> 'paid' nên không match -> 0 row trả về
    queryImpl: async (sql, params) => {
      if (sql.includes('SELECT * FROM orders WHERE tx_signature')) return { rows: [] };
      assert.ok(sql.includes("status <> 'paid'"), 'Query UPDATE phải có điều kiện chặn update đơn đã paid');
      return { rows: [] }; // simulate: WHERE không match vì status hiện tại đã là 'paid'
    },
  });

  const result = await orderModel.updateOrderStatus('order-1', 'paid', 'sig-new');

  assert.strictEqual(result, null, 'Không được update lại đơn đã paid, phải trả null');
});

// ─── Test 2 (BẪY quan trọng nhất): tx_signature đã thuộc đơn khác -> chặn ngay từ đầu ──

test('updateOrderStatus: tx_signature đã được dùng bởi ĐƠN KHÁC -> chặn update, trả null, KHÔNG chạy UPDATE', async () => {
  let updateQueryRan = false;

  const orderModel = freshOrderModel({
    queryImpl: async (sql, params) => {
      if (sql.includes('SELECT * FROM orders WHERE tx_signature')) {
        // Signature này đã thuộc đơn khác (order-OLD), không phải đơn đang xử lý (order-NEW)
        return { rows: [{ id: 'order-OLD', tx_signature: params[0] }] };
      }
      updateQueryRan = true;
      return { rows: [{ id: 'order-NEW', status: 'paid' }] };
    },
  });

  const result = await orderModel.updateOrderStatus('order-NEW', 'paid', 'sig-shared');

  assert.strictEqual(result, null, 'Phải chặn và trả null khi signature đã thuộc đơn khác');
  assert.strictEqual(updateQueryRan, false, 'KHÔNG được chạy câu UPDATE khi đã phát hiện signature trùng — tránh ghi đè 2 đơn cùng 1 signature');
});

// ─── Test 3: tx_signature giống nhau NHƯNG cùng 1 đơn (gọi lại idempotent) -> vẫn cho qua ──

test('updateOrderStatus: poll lại CÙNG đơn với CÙNG tx_signature (watcher retry) -> cho phép chạy UPDATE query để xử lý idempotent', async () => {
  let updateQueryRan = false;
  const orderModel = freshOrderModel({
    queryImpl: async (sql, params) => {
      if (sql.includes('SELECT * FROM orders WHERE tx_signature')) {
        // Signature thuộc CHÍNH đơn đang được update (order-1), không phải đơn khác
        return { rows: [{ id: 'order-1', tx_signature: params[0], status: 'pending' }] };
      }
      updateQueryRan = true;
      return { rows: [{ id: 'order-1', status: 'paid', tx_signature: params[2] }] };
    },
  });

  const result = await orderModel.updateOrderStatus('order-1', 'paid', 'sig-abc');

  assert.strictEqual(updateQueryRan, true, 'Nên chạy câu UPDATE query khi signature thuộc chính đơn này');
  assert.strictEqual(result.status, 'paid');
});

// ─── Test 4: update status khác "paid" (ví dụ payment_mismatch) -> không cần check tx_signature trùng nếu không truyền sig ──

test('updateOrderStatus: update sang "payment_mismatch" KHÔNG kèm tx_signature -> không gọi query check trùng signature', async () => {
  let checkSignatureQueryRan = false;

  const orderModel = freshOrderModel({
    queryImpl: async (sql) => {
      if (sql.includes('SELECT * FROM orders WHERE tx_signature')) {
        checkSignatureQueryRan = true;
        return { rows: [] };
      }
      return { rows: [{ id: 'order-1', status: 'payment_mismatch' }] };
    },
  });

  await orderModel.updateOrderStatus('order-1', 'payment_mismatch', null);

  assert.strictEqual(checkSignatureQueryRan, false, 'Không truyền tx_signature thì không cần check trùng');
});

// ─── Test 5: update đơn đang "pending" -> "paid" với tx_signature mới (case bình thường nhất) ──

test('updateOrderStatus: case bình thường — pending -> paid với signature mới hoàn toàn', async () => {
  let updateParams = null;

  const orderModel = freshOrderModel({
    queryImpl: async (sql, params) => {
      if (sql.includes('SELECT * FROM orders WHERE tx_signature')) return { rows: [] };
      updateParams = params;
      return { rows: [{ id: 'order-1', status: 'paid', tx_signature: params[2] }] };
    },
  });

  const result = await orderModel.updateOrderStatus('order-1', 'paid', 'sig-fresh');

  assert.strictEqual(result.status, 'paid');
  assert.deepStrictEqual(updateParams, ['order-1', 'paid', 'sig-fresh']);
});

// ─── Test 6: update đơn không tồn tại -> trả null, không throw ─────────────

test('updateOrderStatus: orderId không tồn tại -> trả null', async () => {
  const orderModel = freshOrderModel({
    queryImpl: async (sql) => {
      if (sql.includes('SELECT * FROM orders WHERE tx_signature')) return { rows: [] };
      return { rows: [] };
    },
  });

  const result = await orderModel.updateOrderStatus('khong-ton-tai', 'paid', 'sig-x');

  assert.strictEqual(result, null);
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
  console.log('\n⚠️  Test 3 phát hiện một điểm CẦN XÁC NHẬN với team: code hiện tại trong updateOrderStatus()');
  console.log('   chặn cả trường hợp tx_signature trùng với CHÍNH đơn hàng đang update (không chỉ đơn khác).');
  console.log('   Nếu watcher poll lại đơn đã paid với cùng signature, hàm sẽ trả null dù về logic nghiệp vụ');
  console.log('   điều đó là hợp lệ (idempotent). Cần hỏi lại: đây là chủ ý hay là bug cần sửa?');
  if (failed > 0) process.exit(1);
})();