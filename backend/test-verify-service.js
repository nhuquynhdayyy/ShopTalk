/**
 * test-verify-service.js
 * Kiểm tra Task 6: verify.service.js — payment verify logic on-chain
 *
 * verifyPayment() nhận options.rpcCall để inject mock — không cần can thiệp
 * require.cache, đây là điểm thiết kế tốt của file gốc.
 */

const assert = require('assert');
const { verifyPayment } = require('./src/services/verify.service');

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const RECIPIENT = 'SellerWalletAddress111';
const REFERENCE = 'RefKeyAddress222';
const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

function buildTx({ amountRaw, recipient = RECIPIENT, mint = USDC_MINT, reference = REFERENCE, hasErr = false }) {
  return {
    transaction: {
      message: {
        accountKeys: [{ pubkey: reference }, { pubkey: recipient }],
        instructions: [],
      },
    },
    meta: {
      err: hasErr ? { Custom: 1 } : null,
      preTokenBalances: [
        { owner: recipient, mint, uiTokenAmount: { amount: '0' } },
      ],
      postTokenBalances: [
        { owner: recipient, mint, uiTokenAmount: { amount: String(amountRaw) } },
      ],
    },
  };
}

function mockRpc(handlers) {
  return async (method, params) => {
    if (!handlers[method]) throw new Error(`Unexpected RPC method called: ${method}`);
    return handlers[method](params);
  };
}

// ─── Test 1: Happy path — đủ tiền, finalized, đúng reference ──────────────

test('verifyPayment: thành công khi tx finalized, đúng reference, đủ tiền USDC', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-1', confirmationStatus: 'finalized', err: null }],
    getTransaction: async () => buildTx({ amountRaw: 15_000_000 }), // 15 USDC (6 decimals)
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.signature, 'sig-1');
});

// ─── Test 2 (BẪY): transaction chưa finalized -> phải bỏ qua, KHÔNG verify ─

test('verifyPayment: confirmationStatus != "finalized" -> bỏ qua, trả PAYMENT_NOT_FOUND', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-1', confirmationStatus: 'confirmed', err: null }],
    getTransaction: async () => { throw new Error('Không nên gọi getTransaction cho tx chưa finalized'); },
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'PAYMENT_NOT_FOUND');
});

// ─── Test 3 (BẪY): nhận đủ tiền nhưng SAI mint (không phải USDC devnet) ────

test('verifyPayment: nhận đúng amount nhưng SAI mint -> không được tính là thanh toán hợp lệ', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-1', confirmationStatus: 'finalized', err: null }],
    getTransaction: async () => buildTx({ amountRaw: 15_000_000, mint: 'SomeOtherTokenMintXXXX' }),
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false, 'Token sai mint không được coi là thanh toán hợp lệ');
});

// ─── Test 4 (BẪY): PAYMENT_MISMATCH — nhận ít hơn số tiền yêu cầu ──────────

test('verifyPayment: nhận ít hơn expected amount -> trả PAYMENT_MISMATCH kèm số liệu', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-1', confirmationStatus: 'finalized', err: null }],
    getTransaction: async () => buildTx({ amountRaw: 5_000_000 }), // chỉ 5 USDC, cần 15
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'PAYMENT_MISMATCH');
  assert.strictEqual(result.receivedAmount, '5');
  assert.strictEqual(result.expectedAmount, '15');
});

// ─── Test 5: nhận NHIỀU hơn expected amount -> vẫn pass (>=) ───────────────

test('verifyPayment: nhận nhiều hơn expected amount -> vẫn thành công (>= expected)', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-1', confirmationStatus: 'finalized', err: null }],
    getTransaction: async () => buildTx({ amountRaw: 20_000_000 }), // 20 USDC, cần 15
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, true);
});

// ─── Test 6 (BẪY quan trọng): transaction KHÔNG chứa reference -> bỏ qua ───

test('verifyPayment: transaction không chứa đúng reference key -> KHÔNG được match (PAYMENT_NOT_FOUND)', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-1', confirmationStatus: 'finalized', err: null }],
    getTransaction: async () => buildTx({ amountRaw: 15_000_000, reference: 'WrongReferenceKey999' }),
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'PAYMENT_NOT_FOUND');
});

// ─── Test 7: RATE_LIMITED phải được nhận diện và trả error riêng ───────────

test('verifyPayment: RPC bị rate limit (429) -> trả về error RATE_LIMITED, không phải VALIDATION_FAILED', async () => {
  const rpcCall = async () => {
    throw new Error('RPC rate limit: Too Many Requests (429)');
  };

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'RATE_LIMITED');
});

// ─── Test 8: không có signature nào -> PAYMENT_NOT_FOUND ───────────────────

test('verifyPayment: không có giao dịch nào trên reference -> PAYMENT_NOT_FOUND', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [],
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'PAYMENT_NOT_FOUND');
});

// ─── Test 9 (BẪY): transaction có err on-chain -> phải skip, không tính là payment ──

test('verifyPayment: signature có err (tx thất bại on-chain) -> bị skip, không match', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-failed', confirmationStatus: 'finalized', err: { InstructionError: [] } }],
    getTransaction: async () => { throw new Error('Không nên gọi getTransaction cho signature có err'); },
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'PAYMENT_NOT_FOUND');
});

// ─── Test 10: input thiếu (reference/amount/recipient null) -> INVALID_VERIFY_INPUT ──

test('verifyPayment: thiếu reference -> trả INVALID_VERIFY_INPUT, không gọi RPC', async () => {
  let rpcCalled = false;
  const rpcCall = async () => { rpcCalled = true; };

  const result = await verifyPayment(null, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'INVALID_VERIFY_INPUT');
  assert.strictEqual(rpcCalled, false, 'Không nên gọi RPC khi input không hợp lệ');
});

// ─── Test 11: hỗ trợ truyền order object (orderOrReference dạng object) ────

test('verifyPayment: hỗ trợ truyền nguyên object order thay vì 3 tham số riêng lẻ', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [{ signature: 'sig-1', confirmationStatus: 'finalized', err: null }],
    getTransaction: async () => buildTx({ amountRaw: 15_000_000 }),
  });

  const order = { id: 'order-99', reference: REFERENCE, amount: 15, seller_wallet: RECIPIENT };
  const result = await verifyPayment(order, undefined, undefined, { rpcCall });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.orderId, 'order-99', 'orderId phải được giữ lại trong kết quả khi truyền object order');
});

// ─── Test 12 (BẪY tinh vi): nhiều signature, cái đầu mismatch, cái sau đúng -> phải tìm tiếp ──

test('verifyPayment: signature đầu tiên mismatch, signature sau đúng -> phải tiếp tục tìm và trả success', async () => {
  const rpcCall = mockRpc({
    getSignaturesForAddress: async () => [
      { signature: 'sig-old-mismatch', confirmationStatus: 'finalized', err: null },
      { signature: 'sig-correct', confirmationStatus: 'finalized', err: null },
    ],
    getTransaction: async (params) => {
      const [signature] = params;
      if (signature === 'sig-old-mismatch') return buildTx({ amountRaw: 1_000_000 }); // thiếu tiền
      return buildTx({ amountRaw: 15_000_000 }); // đủ tiền
    },
  });

  const result = await verifyPayment(REFERENCE, 15, RECIPIENT, { rpcCall });

  assert.strictEqual(result.success, true, 'Phải tìm tiếp và tìm thấy signature đúng dù cái đầu mismatch');
  assert.strictEqual(result.signature, 'sig-correct');
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