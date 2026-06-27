/**
 * test-socket-events.js
 * Kiểm tra Task 1: WebSocket Event Contract (socket.server.js)
 *
 * Không chỉ test "emit đúng tên event" — còn test:
 *  - payload đúng field, đúng kiểu dữ liệu (Number, không phải string)
 *  - giá trị default (type='voice', reason='manual_request', timestamp tự sinh)
 *  - hành vi khi io CHƯA được khởi tạo (phải trả false, không throw)
 *  - emitOrderPaid phải tự map field từ object "order" kiểu DB row (snake_case)
 */

const assert = require('assert');
const {
  emitOrderPaid,
  emitNewOrder,
  emitTranscriptReceived,
  emitEscalationRequest,
  emitPaymentReminder,
  __setIoForTest,
} = require('./src/websocket/socket.server');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   ${err.message}`);
    failed += 1;
  }
}

// ─── Mock io ────────────────────────────────────────────────────────────────

function createMockIo() {
  const calls = [];
  return {
    emit: (eventName, payload) => calls.push({ eventName, payload }),
    calls,
  };
}

// ─── 1. order_paid ──────────────────────────────────────────────────────────

test('emitOrderPaid: bắn đúng tên event "order_paid" và "payment_confirmed"', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitOrderPaid({
    id: 'order-123',
    reference: 'ref-abc',
    amount: '15.500000', // DB trả về string (DECIMAL) — đây là điểm hay bị bug
    product_name: 'Áo thun',
    tx_signature: 'sig-xyz',
  });

  assert.strictEqual(mockIo.calls.length, 2);
  assert.strictEqual(mockIo.calls[0].eventName, 'payment_confirmed');
  assert.strictEqual(mockIo.calls[0].payload.orderId, 'order-123');
  assert.strictEqual(mockIo.calls[1].eventName, 'order_paid');
});

test('emitOrderPaid: payload map đúng field snake_case -> camelCase', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitOrderPaid({
    id: 'order-123',
    reference: 'ref-abc',
    amount: '15.5',
    product_name: 'Áo thun',
    tx_signature: 'sig-xyz',
  });

  const { payload } = mockIo.calls[1];
  assert.strictEqual(payload.orderId, 'order-123');
  assert.strictEqual(payload.reference, 'ref-abc');
  assert.strictEqual(payload.productName, 'Áo thun');
  assert.strictEqual(payload.txSignature, 'sig-xyz');
  assert.ok(payload.paidAt, 'paidAt phải tự sinh nếu không truyền vào');
});

test('emitOrderPaid: amount phải là Number, không phải string (DB trả DECIMAL dạng string)', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitOrderPaid({ id: '1', reference: 'r', amount: '15.500000', product_name: 'X', tx_signature: 's' });

  const { payload } = mockIo.calls[1];
  assert.strictEqual(typeof payload.amount, 'number', `amount phải là number, nhận được ${typeof payload.amount}`);
  assert.strictEqual(payload.amount, 15.5);
});

// ─── 2. transcript_received ─────────────────────────────────────────────────

test('emitTranscriptReceived: bắn đúng event + giữ nguyên field bắt buộc', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitTranscriptReceived({
    sessionId: 'session-1',
    sender: 'user',
    transcript: 'Xin chào',
  });

  const { eventName, payload } = mockIo.calls[0];
  assert.strictEqual(eventName, 'transcript_received');
  assert.strictEqual(payload.sessionId, 'session-1');
  assert.strictEqual(payload.sender, 'user');
  assert.strictEqual(payload.transcript, 'Xin chào');
});

test('emitTranscriptReceived: default type phải là "voice" nếu không truyền', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitTranscriptReceived({ sessionId: 's1', sender: 'user', transcript: 'hi' });

  assert.strictEqual(mockIo.calls[0].payload.type, 'voice');
});

test('emitTranscriptReceived: cho phép override type thành "text"', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitTranscriptReceived({ sessionId: 's1', sender: 'user', transcript: 'hi', type: 'text' });

  assert.strictEqual(mockIo.calls[0].payload.type, 'text');
});

// ─── 3. escalation_request ──────────────────────────────────────────────────

test('emitEscalationRequest: default reason phải là "manual_request"', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitEscalationRequest({ sessionId: 's1', message: 'Tôi cần hỗ trợ' });

  const { eventName, payload } = mockIo.calls[0];
  assert.strictEqual(eventName, 'escalation_request');
  assert.strictEqual(payload.reason, 'manual_request');
});

test('emitEscalationRequest: cho phép custom reason', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitEscalationRequest({ sessionId: 's1', message: 'lỗi thanh toán', reason: 'payment_issue' });

  assert.strictEqual(mockIo.calls[0].payload.reason, 'payment_issue');
});

// ─── 4. payment_reminder ─────────────────────────────────────────────────────

test('emitPaymentReminder: bắn đúng event + đúng field minutesWaiting', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitPaymentReminder({
    orderId: 'order-1',
    amount: '20.00',
    productName: 'Quần jean',
    minutesWaiting: 5,
  });

  const { eventName, payload } = mockIo.calls[0];
  assert.strictEqual(eventName, 'payment_reminder');
  assert.strictEqual(payload.orderId, 'order-1');
  assert.strictEqual(payload.minutesWaiting, 5);
  assert.strictEqual(typeof payload.amount, 'number', 'amount phải convert sang number');
});

// ─── 5. Hành vi khi io CHƯA khởi tạo (case dễ bị bỏ qua) ────────────────────

test('Khi io chưa init (null): emit phải trả về false, KHÔNG throw lỗi', () => {
  __setIoForTest(null);

  let result;
  let threw = false;
  try {
    result = emitOrderPaid({ id: '1', reference: 'r', amount: '1', product_name: 'x', tx_signature: 's' });
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, false, 'Không được throw khi io chưa init');
  assert.strictEqual(result, false, 'Phải trả về false khi io chưa init');
});

// ─── 6. timestamp tự sinh phải là ISO string hợp lệ ─────────────────────────

test('timestamp tự sinh (transcript_received) phải là ISO 8601 hợp lệ', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  emitTranscriptReceived({ sessionId: 's1', sender: 'user', transcript: 'hi' });

  const { timestamp } = mockIo.calls[0].payload;
  assert.ok(!Number.isNaN(Date.parse(timestamp)), `timestamp "${timestamp}" không parse được thành Date`);
});

// ─── 7. emitNewOrder ──────────────────────────────────────────────────────────

test('emitNewOrder: bắn đúng event new_order và map đúng field + types', () => {
  const mockIo = createMockIo();
  __setIoForTest(mockIo);

  const testDate = new Date();
  emitNewOrder({
    id: 'order-100',
    reference: 'ref-100',
    product_name: 'Sản phẩm mới',
    amount: '99.950000',
    seller_wallet: 'wallet-100',
    status: 'pending',
    created_at: testDate,
    expires_at: testDate,
    customer_name: 'Khách 100'
  });

  assert.strictEqual(mockIo.calls.length, 1);
  const { eventName, payload } = mockIo.calls[0];
  assert.strictEqual(eventName, 'new_order');
  assert.strictEqual(payload.id, 'order-100');
  assert.strictEqual(payload.amount, 99.95);
  assert.strictEqual(payload.created_at, testDate.toISOString());
  assert.strictEqual(payload.expires_at, testDate.toISOString());
  assert.strictEqual(payload.customer_name, 'Khách 100');
});

// ─── Kết quả ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);