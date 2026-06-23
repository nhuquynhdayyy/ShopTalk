const assert = require('assert');
const { verifyPayment } = require('./src/services/verify.service');

const calls = [];

const mockRpcCall = async (method) => {
  calls.push(method);

  if (method === 'getSignaturesForAddress') {
    return [
      {
        signature: 'tx-confirmed-only',
        err: null,
        confirmationStatus: 'confirmed',
      },
    ];
  }

  throw new Error(`Non-finalized transactions must not be fetched: ${method}`);
};

(async () => {
  const result = await verifyPayment(
    {
      id: 'order-nonfinalized',
      reference: 'reference-nonfinalized',
      amount: 1,
      seller_wallet: 'seller-wallet',
    },
    undefined,
    undefined,
    { rpcCall: mockRpcCall }
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'PAYMENT_NOT_FOUND');
  assert.deepStrictEqual(calls, ['getSignaturesForAddress']);

  console.log('PASS verify.service non-finalized transaction stays pending case');
})();
