const assert = require('assert');
const path = require('path');

const orderModelPath = path.resolve(__dirname, 'src/models/order.model.js');
const verifyServicePath = path.resolve(__dirname, 'src/services/verify.service.js');

const updates = [];

require.cache[orderModelPath] = {
  id: orderModelPath,
  filename: orderModelPath,
  loaded: true,
  exports: {
    getPendingOrders: async () => [
      {
        id: 'order-mismatch',
        reference: 'reference-mismatch',
        amount: '1.00',
        seller_wallet: 'seller-wallet',
      },
    ],
    updateOrderStatus: async (id, status, txSignature) => {
      updates.push({ id, status, txSignature });
      return { id, status, tx_signature: txSignature };
    },
  },
};

require.cache[verifyServicePath] = {
  id: verifyServicePath,
  filename: verifyServicePath,
  loaded: true,
  exports: {
    verifyPayment: async (reference, amount, sellerWallet) => {
      assert.strictEqual(reference, 'reference-mismatch');
      assert.strictEqual(amount, '1.00');
      assert.strictEqual(sellerWallet, 'seller-wallet');

      return {
        success: false,
        error: 'PAYMENT_MISMATCH',
        message: 'Received less USDC than expected.',
        signature: 'tx-mismatch',
        expectedAmount: '1.00',
        receivedAmount: '0.50',
      };
    },
  },
};

const { runOnePoll } = require('./src/workers/paymentWatcher');

(async () => {
  const result = await runOnePoll();

  assert.deepStrictEqual(result, { rateLimited: false });
  assert.deepStrictEqual(updates, [
    {
      id: 'order-mismatch',
      status: 'payment_mismatch',
      txSignature: 'tx-mismatch',
    },
  ]);

  console.log('PASS paymentWatcher PAYMENT_MISMATCH case');
})();
