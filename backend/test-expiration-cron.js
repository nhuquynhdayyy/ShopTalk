const assert = require('assert');
const path = require('path');

const orderModelPath = path.resolve(__dirname, 'src/models/order.model.js');
const updates = [];

require.cache[orderModelPath] = {
  id: orderModelPath,
  filename: orderModelPath,
  loaded: true,
  exports: {
    getExpiredPendingOrders: async () => [
      { id: 'expired-order-1' },
      { id: 'expired-order-2' },
    ],
    updateOrderStatus: async (id, status) => {
      updates.push({ id, status });
      return { id, status };
    },
  },
};

const { runExpirationSweep } = require('./src/workers/expirationCron');

(async () => {
  const result = await runExpirationSweep();

  assert.deepStrictEqual(result, {
    skipped: false,
    expiredCount: 2,
  });

  assert.deepStrictEqual(updates, [
    { id: 'expired-order-1', status: 'expired' },
    { id: 'expired-order-2', status: 'expired' },
  ]);

  console.log('PASS expirationCron expired pending orders case');
})();
