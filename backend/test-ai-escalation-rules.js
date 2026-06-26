const assert = require('assert');

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';
process.env.GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
process.env.ESCALATION_ORDER_THRESHOLD_USDC = '100';
process.env.ESCALATION_REPEAT_QUESTION_LIMIT = '2';

const { __setIoForTest } = require('./src/websocket/socket.server');
const { chat } = require('./src/services/ai.service');

let passed = 0;
let failed = 0;
const tests = [];

const test = (name, fn) => tests.push({ name, fn });

const makeToolResponse = (name, args) => ({
  choices: [{
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: `tool-${Date.now()}-${Math.random()}`,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args)
        }
      }]
    }
  }]
});

const makeTextResponse = (content) => ({
  choices: [{
    message: {
      role: 'assistant',
      content
    }
  }]
});

const createSocketCapture = () => {
  const events = [];
  __setIoForTest({
    emit: (eventName, payload) => {
      events.push({ eventName, payload });
      return true;
    },
    to: (roomName) => ({
      emit: (eventName, payload) => {
        events.push({ eventName, payload, room: roomName });
        return true;
      }
    })
  });
  return events;
};

const setFetchResponses = (...responses) => {
  let callCount = 0;
  global.fetch = async () => {
    const response = responses[Math.min(callCount, responses.length - 1)];
    callCount += 1;
    return {
      json: async () => response
    };
  };
  return () => callCount;
};

test('Task 1: check_inventory không tìm thấy sản phẩm -> escalate true và emit escalation_request', async () => {
  const events = createSocketCapture();
  const getCallCount = setFetchResponses(makeToolResponse('check_inventory', { product_name: 'Máy bay không gian' }));

  const result = await chat('session-inventory-missing', 'Shop có máy bay không gian không?');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.escalate, true);
  assert.strictEqual(result.escalationReason, 'inventory_not_found');
  assert.strictEqual(getCallCount(), 1, 'Không gọi LLM vòng 2 khi đã escalation');
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].eventName, 'escalation_request');
  assert.strictEqual(events[0].payload.reason, 'inventory_not_found');
});

test('Task 2: khách hỏi lặp cùng một câu 2 lần -> escalate trước khi gọi LLM lần hai', async () => {
  const events = createSocketCapture();
  const getCallCount = setFetchResponses(makeTextResponse('Dạ em đang kiểm tra cho anh/chị ạ.'));
  const sessionId = 'session-repeat-question';

  const first = await chat(sessionId, 'Sản phẩm này còn hàng không?');
  const second = await chat(sessionId, 'san pham nay con hang khong');

  assert.strictEqual(first.escalate, false);
  assert.strictEqual(second.escalate, true);
  assert.strictEqual(second.escalationReason, 'repeated_question');
  assert.strictEqual(getCallCount(), 1, 'Lần hỏi lặp phải escalation trước khi gọi LLM');
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].payload.reason, 'repeated_question');
});

test('Task 3: create_order vượt ngưỡng -> không tạo đơn, escalate cho chủ shop duyệt', async () => {
  const events = createSocketCapture();
  const getCallCount = setFetchResponses(makeToolResponse('create_order', {
    product_name: 'Solana Mobile Saga Phone',
    amount: 150,
    customer_name: 'Thanh Phúc',
    customer_phone: '0900000000',
    customer_address: 'Quận 1'
  }));

  const result = await chat('session-high-value-order', 'Tôi mua đơn lớn 150 USDC');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.escalate, true);
  assert.strictEqual(result.escalationReason, 'high_value_order');
  assert.strictEqual(result.orderId, null);
  assert.strictEqual(getCallCount(), 1, 'Không gọi LLM vòng 2 khi đơn vượt ngưỡng');
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].payload.reason, 'high_value_order');
});

test('Task 4: Chặn AI trả lời khi session đang trong chế độ live handoff (isSessionInHandoff)', async () => {
  const events = createSocketCapture();
  const sessionId = 'session-live-handoff-test';
  
  // Giả lập staff accept_escalation
  const { handleAcceptEscalation, __resetLiveHandoffForTest } = require('./src/websocket/socket.server');
  
  handleAcceptEscalation({ join: () => {}, data: {} }, { sessionId, staffName: 'Thanh Phúc' });
  
  const result = await chat(sessionId, 'Nhân viên có đó không?');
  
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.reply, null);
  assert.strictEqual(result.suppress, true);
  
  // Cleanup
  __resetLiveHandoffForTest();
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
      passed += 1;
    } catch (err) {
      console.log(`FAIL: ${name}`);
      console.log(`  ${err.stack || err.message}`);
      failed += 1;
    }
  }

  __setIoForTest(null);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
