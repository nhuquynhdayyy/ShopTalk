/**
 * test-transcript-received.js
 * Kiểm tra Task 3: Lưu transcript + bắn transcript_received
 *
 * GHI CHÚ QUAN TRỌNG: Trong codebase hiện tại, ChatHistoryModel.addMessage()
 * và emitTranscriptReceived() đã tồn tại riêng lẻ, NHƯNG chưa có nơi nào
 * (route/controller) gọi nối 2 hàm này lại với nhau theo đúng spec
 * ("nhận transcript -> addMessage -> emit transcript_received").
 *
 * Test này gồm 2 phần:
 *  A. Test ChatHistoryModel.addMessage() thật (mock db.query) — đã có code thật.
 *  B. Test một hàm tích hợp mẫu `handleTranscript()` theo ĐÚNG spec thứ tự
 *     (lưu DB trước, emit sau; nếu lưu DB lỗi thì KHÔNG được emit).
 *     Đây là HÀM CẦN BẠN TẠO RA (ví dụ trong transcript.controller.js hoặc
 *     ngay trong socket.server.js) — test này định nghĩa rõ contract nó phải tuân theo.
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ─── Phần A: ChatHistoryModel.addMessage (code thật) ───────────────────────

const DB_PATH = path.resolve(__dirname, 'src/config/db.js');

function mockDb(queryImpl) {
  delete require.cache[DB_PATH];
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: { query: queryImpl },
  };
}

function freshChatHistoryModel(queryImpl) {
  mockDb(queryImpl);
  const MODEL_PATH = path.resolve(__dirname, 'src/models/chatHistory.model.js');
  delete require.cache[MODEL_PATH];
  return require(MODEL_PATH);
}

test('ChatHistoryModel.addMessage: gọi đúng INSERT với params đúng thứ tự', async () => {
  const calls = [];
  const ChatHistoryModel = freshChatHistoryModel(async (text, params) => {
    calls.push({ text, params });
    return { rows: [{ id: 'msg-1', session_id: params[0], sender: params[1], type: params[2], content: params[3] }] };
  });

  const result = await ChatHistoryModel.addMessage('session-1', 'user', 'voice', 'Xin chào');

  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].params, ['session-1', 'user', 'voice', 'Xin chào', null]);
  assert.strictEqual(result.id, 'msg-1');
});

test('ChatHistoryModel.addMessage: audioUrl mặc định null nếu không truyền', async () => {
  const calls = [];
  const ChatHistoryModel = freshChatHistoryModel(async (text, params) => {
    calls.push(params);
    return { rows: [{ id: 'msg-2' }] };
  });

  await ChatHistoryModel.addMessage('session-1', 'user', 'text', 'hello');

  assert.strictEqual(calls[0][4], null, 'audioUrl phải là null khi không truyền');
});

test('ChatHistoryModel.addMessage: lỗi DB phải được throw lại (propagate), không bị nuốt mất', async () => {
  const ChatHistoryModel = freshChatHistoryModel(async () => {
    throw new Error('connection terminated unexpectedly');
  });

  let threw = false;
  try {
    await ChatHistoryModel.addMessage('session-1', 'user', 'voice', 'hi');
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('connection terminated'));
  }
  assert.strictEqual(threw, true, 'addMessage phải throw lại lỗi DB, không được nuốt lỗi');
});

// ─── Phần B: Contract tích hợp "handleTranscript" theo đúng spec ───────────
//
// Spec: nhận transcript -> ChatHistoryModel.addMessage(...) -> emit transcript_received
// Định nghĩa hàm mẫu ở đây để thấy rõ hành vi ĐÚNG cần có khi bạn viết controller thật.
// Khi bạn đã tạo hàm thật (ví dụ trong transcript.controller.js), thay require() ở dưới
// để trỏ vào file thật thay vì dùng bản mẫu này.

async function handleTranscriptReference(deps, { sessionId, sender, transcript }) {
  const saved = await deps.addMessage(sessionId, sender, 'voice', transcript);
  deps.emitTranscriptReceived({ sessionId, sender, transcript, type: 'voice' });
  return saved;
}

test('[CONTRACT] handleTranscript: phải lưu DB TRƯỚC, emit SAU (đúng thứ tự)', async () => {
  const callOrder = [];

  await handleTranscriptReference({
    addMessage: async (...args) => {
      callOrder.push('addMessage');
      return { id: 'msg-1' };
    },
    emitTranscriptReceived: (...args) => {
      callOrder.push('emit');
    },
  }, { sessionId: 's1', sender: 'user', transcript: 'hi' });

  assert.deepStrictEqual(callOrder, ['addMessage', 'emit'], 'Phải lưu DB trước rồi mới emit, không được làm ngược lại');
});

test('[CONTRACT] handleTranscript: nếu addMessage throw lỗi, KHÔNG được emit', async () => {
  let emitCalled = false;

  let threw = false;
  try {
    await handleTranscriptReference({
      addMessage: async () => { throw new Error('DB down'); },
      emitTranscriptReceived: () => { emitCalled = true; },
    }, { sessionId: 's1', sender: 'user', transcript: 'hi' });
  } catch (e) {
    threw = true;
  }

  assert.strictEqual(threw, true, 'Lỗi DB phải được propagate ra ngoài');
  assert.strictEqual(emitCalled, false, 'KHÔNG được emit transcript_received nếu lưu DB thất bại — tránh Dashboard nhận tin nhắn "ảo" chưa từng được lưu');
});

test('[CONTRACT] handleTranscript: payload emit phải khớp đúng input (sessionId, sender, transcript)', async () => {
  let emittedPayload = null;

  await handleTranscriptReference({
    addMessage: async () => ({ id: 'msg-1' }),
    emitTranscriptReceived: (payload) => { emittedPayload = payload; },
  }, { sessionId: 'session-99', sender: 'agent', transcript: 'Đơn của bạn đã được xử lý' });

  assert.strictEqual(emittedPayload.sessionId, 'session-99');
  assert.strictEqual(emittedPayload.sender, 'agent');
  assert.strictEqual(emittedPayload.transcript, 'Đơn của bạn đã được xử lý');
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
  console.log('\n⚠️  LƯU Ý: Phần [CONTRACT] test một hàm MẪU (handleTranscriptReference) được định nghĩa ngay trong file test này,');
  console.log('   vì chưa có controller/route thật nối addMessage + emit lại với nhau trong codebase.');
  console.log('   Khi đã viết hàm thật, hãy require() hàm đó vào và xóa hàm mẫu này.');
  if (failed > 0) process.exit(1);
})();