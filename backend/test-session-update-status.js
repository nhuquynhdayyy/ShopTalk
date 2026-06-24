/**
 * test-session-update-status.js
 * Kiểm tra SessionModel.updateStatus() (đã tồn tại sẵn trong session.model.js)
 * Đây là test riêng độc lập — KHÔNG núp trong test của escalation worker,
 * đúng theo yêu cầu: phải xác nhận hàm này hoạt động đúng tự thân trước
 * khi escalation.worker.js phụ thuộc vào nó.
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
const SESSION_MODEL_PATH = path.resolve(__dirname, 'src/models/session.model.js');

function freshSessionModel(queryImpl) {
  delete require.cache[DB_PATH];
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: { query: queryImpl } };
  delete require.cache[SESSION_MODEL_PATH];
  return require(SESSION_MODEL_PATH);
}

test('updateStatus: UPDATE đúng id và status', async () => {
  let capturedSQL = '';
  let capturedParams = null;

  const SessionModel = freshSessionModel(async (sql, params) => {
    capturedSQL = sql;
    capturedParams = params;
    return { rows: [{ id: 'session-1', status: 'escalated', user_meta: '{}' }] };
  });

  const result = await SessionModel.updateStatus('session-1', 'escalated');

  assert.ok(capturedSQL.includes('UPDATE sessions'));
  assert.ok(capturedSQL.includes('SET status = $2'));
  assert.deepStrictEqual(capturedParams, ['session-1', 'escalated']);
  assert.strictEqual(result.status, 'escalated');
});

test('updateStatus: parse user_meta JSON string thành object', async () => {
  const SessionModel = freshSessionModel(async () => ({
    rows: [{ id: 's1', status: 'escalated', user_meta: '{"name":"Phúc"}' }],
  }));

  const result = await SessionModel.updateStatus('s1', 'escalated');

  assert.strictEqual(typeof result.user_meta, 'object');
  assert.strictEqual(result.user_meta.name, 'Phúc');
});

test('updateStatus: session không tồn tại -> trả về null (không throw)', async () => {
  const SessionModel = freshSessionModel(async () => ({ rows: [] }));

  const result = await SessionModel.updateStatus('khong-ton-tai', 'escalated');

  assert.strictEqual(result, null);
});

test('updateStatus: user_meta lỗi JSON không hợp lệ -> không crash, trả object rỗng', async () => {
  const SessionModel = freshSessionModel(async () => ({
    rows: [{ id: 's1', status: 'escalated', user_meta: '{json bị hỏng' }],
  }));

  const result = await SessionModel.updateStatus('s1', 'escalated');

  assert.deepStrictEqual(result.user_meta, {});
});

test('updateStatus: lỗi DB phải được throw lại, không nuốt lỗi', async () => {
  const SessionModel = freshSessionModel(async () => { throw new Error('DB lỗi kết nối'); });

  let threw = false;
  try {
    await SessionModel.updateStatus('s1', 'escalated');
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, true);
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
  if (failed > 0) process.exit(1);
})();