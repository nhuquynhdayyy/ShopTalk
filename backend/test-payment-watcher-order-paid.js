/**
 * test-payment-watcher-order-paid.js
 * Kiểm tra Task 2: paymentWatcher.js bắn order_paid khi verify thành công
 *
 * LƯU Ý KỸ THUẬT: paymentWatcher.js dùng destructuring khi require:
 *   const { getPendingOrders, updateOrderStatus } = require('../models/order.model');
 * => Không thể mock bằng cách gán lại property sau khi đã require xong.
 * => Phải mock bằng cách thay thế nội dung module TRƯỚC khi paymentWatcher.js
 *    được require lần đầu tiên (can thiệp vào require.cache).
 *
 * Test này không chỉ check "happy path" mà còn test:
 *  - RATE_LIMITED phải dừng (break) vòng lặp ngay, KHÔNG xử lý tiếp đơn hàng sau nó
 *  - Nếu updateOrderStatus trả về null (do duplicate tx_signature) -> KHÔNG được emit order_paid
 *  - PAYMENT_MISMATCH không được emit order_paid
 *  - 1 lỗi ở 1 đơn hàng không làm crash toàn bộ vòng poll (đơn khác vẫn được xử lý)
 */

const assert = require('assert');
const path = require('path');
const Module = require('module');

let passed = 0;
let failed = 0;

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ─── Mock injection bằng require.cache ──────────────────────────────────────

const ORDER_MODEL_PATH = path.resolve(__dirname, 'src/models/order.model.js');
const VERIFY_SERVICE_PATH = path.resolve(__dirname, 'src/services/verify.service.js');
const SOCKET_SERVER_PATH = path.resolve(__dirname, 'src/websocket/socket.server.js');
const WATCHER_PATH = path.resolve(__dirname, 'src/workers/paymentWatcher.js');

function injectMock(modulePath, exportsObj) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: exportsObj,
  };
}

function freshRequireWatcher({ getPendingOrders, updateOrderStatus, verifyPayment, emitOrderPaid }) {
  // Xoá cache cũ (nếu có) để buộc require lại từ đầu với mock mới
  delete require.cache[WATCHER_PATH];
  delete require.cache[ORDER_MODEL_PATH];
  delete require.cache[VERIFY_SERVICE_PATH];
  delete require.cache[SOCKET_SERVER_PATH];

  injectMock(ORDER_MODEL_PATH, { getPendingOrders, updateOrderStatus, getOrderByTxSignature: async () => null });
  injectMock(VERIFY_SERVICE_PATH, { verifyPayment });
  injectMock(SOCKET_SERVER_PATH, { emitOrderPaid, getIo: () => null });

  return require(WATCHER_PATH);
}

// ─── Test 1: verify thành công -> phải gọi updateOrderStatus('paid') và emitOrderPaid ──

test('verify thành công: gọi updateOrderStatus(id, "paid", signature) và emitOrderPaid', async () => {
  const updateCalls = [];
  const emitCalls = [];

  const order = { id: 'order-1', reference: 'ref-1', amount: 10, seller_wallet: 'wallet-1' };

  const { runOnePoll } = freshRequireWatcher({
    getPendingOrders: async () => [order],
    updateOrderStatus: async (id, status, sig) => {
      updateCalls.push({ id, status, sig });
      return { id, status, tx_signature: sig, reference: 'ref-1', amount: 10, product_name: 'P' };
    },
    verifyPayment: async () => ({ success: true, signature: 'sig-abc' }),
    emitOrderPaid: (updatedOrder) => emitCalls.push(updatedOrder),
  });

  await runOnePoll();

  assert.strictEqual(updateCalls.length, 1);
  assert.strictEqual(updateCalls[0].id, 'order-1');
  assert.strictEqual(updateCalls[0].status, 'paid');
  assert.strictEqual(updateCalls[0].sig, 'sig-abc');

  assert.strictEqual(emitCalls.length, 1, 'emitOrderPaid phải được gọi đúng 1 lần');
  assert.strictEqual(emitCalls[0].id, 'order-1');
});

// ─── Test 2 (BẪY): updateOrderStatus trả null (duplicate tx_signature) -> KHÔNG emit ──

test('updateOrderStatus trả về null (duplicate signature): KHÔNG được gọi emitOrderPaid', async () => {
  const emitCalls = [];
  const order = { id: 'order-2', reference: 'ref-2', amount: 10, seller_wallet: 'wallet-1' };

  const { runOnePoll } = freshRequireWatcher({
    getPendingOrders: async () => [order],
    updateOrderStatus: async () => null, // simulate: signature đã thuộc đơn khác
    verifyPayment: async () => ({ success: true, signature: 'sig-dup' }),
    emitOrderPaid: (o) => emitCalls.push(o),
  });

  await runOnePoll();

  assert.strictEqual(emitCalls.length, 0, 'Không được emit order_paid khi updateOrderStatus trả null');
});

// ─── Test 3 (BẪY): PAYMENT_MISMATCH -> KHÔNG emit order_paid, vẫn update status ────

test('PAYMENT_MISMATCH: update status "payment_mismatch", KHÔNG emit order_paid', async () => {
  const updateCalls = [];
  const emitCalls = [];
  const order = { id: 'order-3', reference: 'ref-3', amount: 10, seller_wallet: 'wallet-1' };

  const { runOnePoll } = freshRequireWatcher({
    getPendingOrders: async () => [order],
    updateOrderStatus: async (id, status, sig) => {
      updateCalls.push({ id, status, sig });
      return { id, status };
    },
    verifyPayment: async () => ({
      success: false,
      error: 'PAYMENT_MISMATCH',
      expectedAmount: '10',
      receivedAmount: '5',
      signature: 'sig-mismatch',
    }),
    emitOrderPaid: (o) => emitCalls.push(o),
  });

  await runOnePoll();

  assert.strictEqual(emitCalls.length, 0, 'KHÔNG được emit order_paid khi mismatch');
  assert.strictEqual(updateCalls.length, 1);
  assert.strictEqual(updateCalls[0].status, 'payment_mismatch');
});

// ─── Test 4 (BẪY quan trọng nhất): RATE_LIMITED phải break loop ngay ───────────────

test('RATE_LIMITED ở đơn đầu: phải dừng (break) ngay, KHÔNG xử lý đơn hàng thứ 2', async () => {
  const processedOrderIds = [];
  const orders = [
    { id: 'order-A', reference: 'ref-A', amount: 10, seller_wallet: 'w' },
    { id: 'order-B', reference: 'ref-B', amount: 10, seller_wallet: 'w' },
  ];

  const { runOnePoll } = freshRequireWatcher({
    getPendingOrders: async () => orders,
    updateOrderStatus: async (id, status) => ({ id, status }),
    verifyPayment: async (reference) => {
      processedOrderIds.push(reference);
      if (reference === 'ref-A') {
        return { success: false, error: 'RATE_LIMITED' };
      }
      return { success: true, signature: 'sig-B' };
    },
    emitOrderPaid: () => {},
  });

  const result = await runOnePoll();

  assert.strictEqual(processedOrderIds.length, 1, 'Chỉ được xử lý đơn đầu tiên trước khi break');
  assert.strictEqual(processedOrderIds[0], 'ref-A');
  assert.strictEqual(result.rateLimited, true, 'runOnePoll() phải trả về { rateLimited: true }');
});

// ─── Test 5: PAYMENT_NOT_FOUND -> bỏ qua êm, tiếp tục đơn khác (không break) ──────

test('PAYMENT_NOT_FOUND ở đơn đầu: vẫn tiếp tục xử lý đơn hàng kế tiếp', async () => {
  const processedOrderIds = [];
  const orders = [
    { id: 'order-A', reference: 'ref-A', amount: 10, seller_wallet: 'w' },
    { id: 'order-B', reference: 'ref-B', amount: 10, seller_wallet: 'w' },
  ];

  const { runOnePoll } = freshRequireWatcher({
    getPendingOrders: async () => orders,
    updateOrderStatus: async (id, status, sig) => ({ id, status, tx_signature: sig }),
    verifyPayment: async (reference) => {
      processedOrderIds.push(reference);
      if (reference === 'ref-A') return { success: false, error: 'PAYMENT_NOT_FOUND' };
      return { success: true, signature: 'sig-B' };
    },
    emitOrderPaid: () => {},
  });

  await runOnePoll();

  assert.strictEqual(processedOrderIds.length, 2, 'Phải xử lý cả 2 đơn, không break khi PAYMENT_NOT_FOUND');
});

// ─── Test 6 (BẪY): 1 đơn hàng throw exception bất ngờ -> không crash cả batch ─────

test('verifyPayment throw exception ở đơn đầu: đơn thứ 2 vẫn phải được xử lý', async () => {
  const processedOrderIds = [];
  const orders = [
    { id: 'order-A', reference: 'ref-A', amount: 10, seller_wallet: 'w' },
    { id: 'order-B', reference: 'ref-B', amount: 10, seller_wallet: 'w' },
  ];

  const { runOnePoll } = freshRequireWatcher({
    getPendingOrders: async () => orders,
    updateOrderStatus: async (id, status, sig) => ({ id, status, tx_signature: sig }),
    verifyPayment: async (reference) => {
      processedOrderIds.push(reference);
      if (reference === 'ref-A') throw new Error('Lỗi mạng đột ngột');
      return { success: true, signature: 'sig-B' };
    },
    emitOrderPaid: () => {},
  });

  let threw = false;
  try {
    await runOnePoll();
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, false, 'runOnePoll() không được để lỗi 1 đơn làm crash toàn bộ poll');
  assert.deepStrictEqual(processedOrderIds, ['ref-A', 'ref-B'], 'Đơn B vẫn phải được xử lý sau khi đơn A lỗi');
});

// ─── Chạy tuần tự thật (bắt buộc, vì các test mutate chung require.cache) ───

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
  if (failed > 0) process.exit(1);
})();