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
        id: 'order-rate-limited',
        reference: 'reference-rate-limited',
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
    verifyPayment: async () => ({
      success: false,
      error: 'RATE_LIMITED',
      message: 'RPC rate limit, retry later.',
    }),
  },
};

const { runOnePoll } = require('./src/workers/paymentWatcher');

(async () => {
  const result = await runOnePoll();

  assert.deepStrictEqual(result, { rateLimited: true });
  assert.deepStrictEqual(updates, []);

  console.log('PASS paymentWatcher RATE_LIMITED backoff case');
})();
