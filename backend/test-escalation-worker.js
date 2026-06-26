/**
 * test-escalation-worker.js
 * Kiểm tra Task 5: escalation.worker.js
 *
 * Contract thật của file (đã xác nhận với code thật trong repo):
 *   module.exports = { processEscalation }
 *   async function processEscalation({ sessionId, message, reason, sender, timestamp }) { ... }
 *
 * Thứ tự bắt buộc:
 *   1. SessionModel.updateStatus(sessionId, 'escalated')
 *   2. ChatHistoryModel.addMessage(sessionId, sender, 'text', message)
 *   3. emitEscalationRequest({ sessionId, message, reason, timestamp })
 *
 * Nếu file backend/src/workers/escalation.worker.js chưa tồn tại, test sẽ
 * tự dùng hàm mẫu (reference impl) định nghĩa ngay trong file này.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const WORKER_PATH = path.resolve(__dirname, 'src/workers/escalation.worker.js');
const WORKER_EXISTS = fs.existsSync(WORKER_PATH);

// ─── Hàm mẫu (reference impl) dùng khi file thật chưa tồn tại ──────────────

async function referenceProcessEscalation(deps, { sessionId, message, reason = 'manual_request', sender = 'user' }) {
  if (!sessionId) throw new Error('sessionId is required');
  if (!message || !String(message).trim()) throw new Error('message is required');

  const cleanMessage = String(message).trim();
  const session = await deps.SessionModel.updateStatus(sessionId, 'escalated');
  const history = await deps.ChatHistoryModel.addMessage(sessionId, sender, 'text', cleanMessage);
  deps.emitEscalationRequest({ sessionId, message: cleanMessage, reason });
  return { session, history };
}

function loadProcessEscalation(mockDeps) {
  if (!WORKER_EXISTS) {
    return (args) => referenceProcessEscalation(mockDeps, args);
  }

  // File thật đã tồn tại: inject mock qua require.cache cho 3 dependency
  // rồi require file thật. Yêu cầu file thật require đúng path tương đối:
  //   ../models/session.model, ../models/chatHistory.model, ../websocket/socket.server
  const SESSION_MODEL_PATH = path.resolve(__dirname, 'src/models/session.model.js');
  const CHAT_HISTORY_PATH = path.resolve(__dirname, 'src/models/chatHistory.model.js');
  const SOCKET_SERVER_PATH = path.resolve(__dirname, 'src/websocket/socket.server.js');

  delete require.cache[WORKER_PATH];
  delete require.cache[SESSION_MODEL_PATH];
  delete require.cache[CHAT_HISTORY_PATH];
  delete require.cache[SOCKET_SERVER_PATH];

  require.cache[SESSION_MODEL_PATH] = {
    id: SESSION_MODEL_PATH, filename: SESSION_MODEL_PATH, loaded: true,
    exports: mockDeps.SessionModel,
  };
  require.cache[CHAT_HISTORY_PATH] = {
    id: CHAT_HISTORY_PATH, filename: CHAT_HISTORY_PATH, loaded: true,
    exports: mockDeps.ChatHistoryModel,
  };
  require.cache[SOCKET_SERVER_PATH] = {
    id: SOCKET_SERVER_PATH, filename: SOCKET_SERVER_PATH, loaded: true,
    exports: { emitEscalationRequest: mockDeps.emitEscalationRequest, getIo: () => null },
  };

  const worker = require(WORKER_PATH);
  return worker.processEscalation;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('processEscalation: gọi đúng thứ tự updateStatus -> addMessage -> emit', async () => {
  const callOrder = [];

  const processEscalation = loadProcessEscalation({
    SessionModel: {
      updateStatus: async (id, status) => { callOrder.push(`updateStatus:${status}`); return { id, status }; },
    },
    ChatHistoryModel: {
      addMessage: async (...args) => { callOrder.push('addMessage'); return { id: 'msg-1' }; },
    },
    emitEscalationRequest: () => { callOrder.push('emit'); },
  });

  await processEscalation({ sessionId: 's1', message: 'Tôi cần hỗ trợ', reason: 'manual_request' });

  assert.deepStrictEqual(
    callOrder,
    ['updateStatus:escalated', 'addMessage', 'emit'],
    'Phải đúng thứ tự: cập nhật session trước, ghi log, rồi mới emit'
  );
});

test('processEscalation: SessionModel.updateStatus phải nhận đúng status "escalated"', async () => {
  let receivedStatus = null;

  const processEscalation = loadProcessEscalation({
    SessionModel: { updateStatus: async (id, status) => { receivedStatus = status; return {}; } },
    ChatHistoryModel: { addMessage: async () => ({}) },
    emitEscalationRequest: () => {},
  });

  await processEscalation({ sessionId: 's1', message: 'msg', reason: 'manual_request' });

  assert.strictEqual(receivedStatus, 'escalated');
});

test('processEscalation: message phải được lưu vào chat_history với đúng sessionId và content', async () => {
  let savedArgs = null;

  const processEscalation = loadProcessEscalation({
    SessionModel: { updateStatus: async () => ({}) },
    ChatHistoryModel: { addMessage: async (...args) => { savedArgs = args; return {}; } },
    emitEscalationRequest: () => {},
  });

  await processEscalation({ sessionId: 'session-42', message: 'Khách muốn nói chuyện với người thật', reason: 'manual_request' });

  assert.strictEqual(savedArgs[0], 'session-42', 'sessionId phải khớp');
  assert.strictEqual(savedArgs[3], 'Khách muốn nói chuyện với người thật', 'content phải là message gốc');
});

test('processEscalation: payload emit phải chứa đúng sessionId, message, reason', async () => {
  let emittedPayload = null;

  const processEscalation = loadProcessEscalation({
    SessionModel: { updateStatus: async () => ({}) },
    ChatHistoryModel: { addMessage: async () => ({}) },
    emitEscalationRequest: (payload) => { emittedPayload = payload; },
  });

  await processEscalation({ sessionId: 's1', message: 'cần hỗ trợ', reason: 'payment_issue' });

  assert.strictEqual(emittedPayload.sessionId, 's1');
  assert.strictEqual(emittedPayload.message, 'cần hỗ trợ');
  assert.strictEqual(emittedPayload.reason, 'payment_issue');
});

test('[BẪY] processEscalation: nếu updateStatus thất bại (throw), KHÔNG được ghi chat_history hay emit', async () => {
  let addMessageCalled = false;
  let emitCalled = false;

  const processEscalation = loadProcessEscalation({
    SessionModel: { updateStatus: async () => { throw new Error('Session không tồn tại'); } },
    ChatHistoryModel: { addMessage: async () => { addMessageCalled = true; return {}; } },
    emitEscalationRequest: () => { emitCalled = true; },
  });

  let threw = false;
  try {
    await processEscalation({ sessionId: 'khong-ton-tai', message: 'msg', reason: 'manual_request' });
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, true, 'Lỗi phải được propagate ra ngoài để caller biết escalation thất bại');
  assert.strictEqual(addMessageCalled, false, 'Không được ghi chat_history nếu session update thất bại');
  assert.strictEqual(emitCalled, false, 'Không được emit nếu session update thất bại — Dashboard sẽ nhận ticket "ảo"');
});

test('[BẪY] processEscalation: nếu addMessage thất bại (throw), KHÔNG được emit (đã update session rồi nhưng vẫn không emit)', async () => {
  let emitCalled = false;

  const processEscalation = loadProcessEscalation({
    SessionModel: { updateStatus: async () => ({ id: 's1', status: 'escalated' }) },
    ChatHistoryModel: { addMessage: async () => { throw new Error('DB lỗi'); } },
    emitEscalationRequest: () => { emitCalled = true; },
  });

  let threw = false;
  try {
    await processEscalation({ sessionId: 's1', message: 'msg', reason: 'manual_request' });
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, true);
  assert.strictEqual(emitCalled, false, 'Không được emit nếu chưa ghi log thành công, dù session đã update');
});

test('[VALIDATE] processEscalation: thiếu sessionId -> throw lỗi, không gọi bất kỳ dependency nào', async () => {
  let anyCalled = false;

  const processEscalation = loadProcessEscalation({
    SessionModel: { updateStatus: async () => { anyCalled = true; return {}; } },
    ChatHistoryModel: { addMessage: async () => { anyCalled = true; return {}; } },
    emitEscalationRequest: () => { anyCalled = true; },
  });

  let threw = false;
  try {
    await processEscalation({ sessionId: null, message: 'msg', reason: 'manual_request' });
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, true, 'Phải throw khi thiếu sessionId');
  assert.strictEqual(anyCalled, false, 'Không được gọi bất kỳ dependency nào nếu input không hợp lệ');
});

test('[VALIDATE] processEscalation: message rỗng hoặc chỉ có khoảng trắng -> throw lỗi', async () => {
  let anyCalled = false;

  const processEscalation = loadProcessEscalation({
    SessionModel: { updateStatus: async () => { anyCalled = true; return {}; } },
    ChatHistoryModel: { addMessage: async () => { anyCalled = true; return {}; } },
    emitEscalationRequest: () => { anyCalled = true; },
  });

  let threw = false;
  try {
    await processEscalation({ sessionId: 's1', message: '   ', reason: 'manual_request' });
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, true, 'Phải throw khi message rỗng/chỉ toàn khoảng trắng');
  assert.strictEqual(anyCalled, false);
});

// ─── Chạy tuần tự ────────────────────────────────────────────────────────────

(async () => {
  if (!WORKER_EXISTS) {
    console.log('⚠️  CHÚ Ý: backend/src/workers/escalation.worker.js CHƯA TỒN TẠI.');
    console.log('   Test đang chạy với hàm MẪU (reference impl) định nghĩa ngay trong file test này.');
    console.log('   Hãy tạo file thật theo đúng contract rồi chạy lại — test sẽ tự dùng code thật.\n');
  }

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